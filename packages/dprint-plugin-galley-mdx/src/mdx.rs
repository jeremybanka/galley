// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jeremy Banka

use markdown::mdast::Node;
use serde_json::Value;

use crate::configuration::Configuration;
use crate::FormatError;

/// Format Markdown around MDX syntax. Never send JSX or JavaScript to the HTML parser.
/// Embedded code is formatted separately; literal contents and ignored regions are preserved.
pub fn format_mdx(
  source: &str,
  config: &Configuration,
  mut format_code: impl FnMut(&str, &str, u32) -> Result<Option<String>, FormatError>,
) -> Result<Option<String>, FormatError> {
  let options = parse_options();
  let original_source = source;
  let (parsed_source, tree) = parse_source(source, &options)?;
  let source = parsed_source.as_str();
  let children = tree.children().expect("MDX document has a root");
  if children
    .iter()
    .any(|node| is_directive(node, &config.ignore_file_directive))
  {
    return Ok(None);
  }

  // A tokenizer workaround must never rewrite ignored input.
  if source != original_source
    && children.iter().any(|node| {
      is_directive(node, &config.ignore_directive)
        || is_directive(node, &config.ignore_start_directive)
        || is_directive(node, &config.ignore_end_directive)
    })
  {
    return Ok(None);
  }
  let original_tree = tree;
  let normalized = crate::mdx_whitespace::normalize(source, &original_tree, config);
  let source = normalized.as_str();
  let Ok(tree) = markdown::to_mdast(source, &options) else {
    return Ok(None);
  };
  let children = tree.children().expect("MDX document has a root");
  let mut output = String::with_capacity(source.len());
  let mut cursor = 0;
  let mut ignore_next = false;
  let mut ignore_region = false;
  for node in children {
    let start_ignore = is_directive(node, &config.ignore_start_directive);
    let end_ignore = is_directive(node, &config.ignore_end_directive);
    if protected(node) || ignore_next || ignore_region || start_ignore || end_ignore {
      let position = node.position().expect("parsed nodes have source positions");
      append_markdown(
        &mut output,
        &source[cursor..position.start.offset],
        config,
        &mut format_code,
      )?;
      if ignore_next || ignore_region || start_ignore || end_ignore || is_directive(node, &config.ignore_directive) {
        output.push_str(&source[position.start.offset..position.end.offset]);
      } else {
        output.push_str(&format_islands(node, source, config.line_width)?);
      }
      cursor = position.end.offset;
    }
    ignore_next = is_directive(node, &config.ignore_directive);
    if start_ignore {
      ignore_region = true;
    }
    if end_ignore {
      ignore_region = false;
    }
  }
  append_markdown(&mut output, &source[cursor..], config, &mut format_code)?;

  if output == original_source {
    return Ok(None);
  }
  // Markdown and MDX have different grammars. A formatter can, for example,
  // remove an escape before `{` or turn an email link into an HTML-like autolink.
  // Keep the original if reparsing changes the document's structure or content.
  let Ok(formatted_tree) = markdown::to_mdast(&output, &options) else {
    return Ok(None);
  };
  if semantic_tree(&original_tree) != semantic_tree(&formatted_tree) {
    return Ok(None);
  }
  Ok(Some(output))
}

fn protected(node: &Node) -> bool {
  matches!(
    node,
    Node::MdxJsxFlowElement(_)
      | Node::MdxJsxTextElement(_)
      | Node::MdxFlowExpression(_)
      | Node::MdxTextExpression(_)
      | Node::MdxjsEsm(_)
      | Node::Yaml(_)
      | Node::Toml(_)
  ) || node.children().is_some_and(|children| children.iter().any(protected))
}

pub(super) fn is_directive(node: &Node, directive: &str) -> bool {
  let Node::MdxFlowExpression(expression) = node else {
    return false;
  };
  expression
    .value
    .trim()
    .strip_prefix("/*")
    .and_then(|value| value.strip_suffix("*/"))
    .is_some_and(|value| value.trim() == directive)
}

fn append_markdown(
  output: &mut String,
  source: &str,
  config: &Configuration,
  format_code: &mut impl FnMut(&str, &str, u32) -> Result<Option<String>, FormatError>,
) -> Result<(), FormatError> {
  // Preserve the separators bordering protected blocks. They can affect MDX's
  // distinction between flow and inline JSX. Only the Markdown run is formatted.
  let body = source.trim_matches(['\r', '\n']);
  if body.trim().is_empty() {
    output.push_str(source);
    return Ok(());
  }
  let prefix_len = source.len() - source.trim_start_matches(['\r', '\n']).len();
  let suffix_start = prefix_len + body.len();
  output.push_str(&source[..prefix_len]);
  match crate::format_text(body, config, format_code)? {
    Some(formatted) => output.push_str(formatted.trim_end_matches(['\r', '\n'])),
    None => output.push_str(body),
  }
  output.push_str(&source[suffix_start..]);
  Ok(())
}

fn semantic_tree(node: &Node) -> Value {
  fn normalize(value: &mut Value) {
    match value {
      Value::Object(object) => {
        object.remove("position");
        if object.contains_key("_markdownRsStops") {
          let kind = object.get("type").and_then(Value::as_str).unwrap_or("").to_string();
          if let Some(Value::String(code)) = object.get_mut("value") {
            let normalized = if kind == "mdxjsEsm" {
              crate::typescript::format_module(code, 80)
            } else {
              crate::typescript::format_expression(code, kind == "mdxJsxExpressionAttribute", 80)
            };
            if let Ok(normalized) = normalized {
              *code = normalized;
            }
          }
        }
        object.remove("_markdownRsStops");
        // Fenced code is intentionally formatted by the host's language plugin.
        // Its language, metadata and location in the tree still have to match.
        if object.get("type").and_then(Value::as_str) == Some("code") {
          object.remove("value");
        }
        if object.get("type").and_then(Value::as_str) == Some("text") {
          if let Some(Value::String(text)) = object.get_mut("value") {
            let mut result = String::new();
            let mut space = false;
            for ch in text.chars() {
              if matches!(ch, ' ' | '\t' | '\r' | '\n') {
                if !space {
                  result.push(' ');
                }
                space = true;
              } else {
                result.push(ch);
                space = false;
              }
            }
            *text = result;
          }
        }
        for value in object.values_mut() {
          normalize(value);
        }
        if matches!(
          object.get("type").and_then(Value::as_str),
          Some("paragraph" | "heading" | "tableCell")
        ) {
          if let Some(Value::Array(children)) = object.get_mut("children") {
            if let Some(first) = children
              .first_mut()
              .filter(|node| node.get("type").and_then(Value::as_str) == Some("text"))
            {
              if let Some(Value::String(text)) = first.get_mut("value") {
                *text = text.trim_start_matches(' ').into();
              }
            }
            if let Some(last) = children
              .last_mut()
              .filter(|node| node.get("type").and_then(Value::as_str) == Some("text"))
            {
              if let Some(Value::String(text)) = last.get_mut("value") {
                *text = text.trim_end_matches(' ').into();
              }
            }
          }
        }
      }
      Value::Array(values) => values.iter_mut().for_each(normalize),
      _ => {}
    }
  }
  let mut value = serde_json::to_value(node).expect("MDX syntax tree is serializable");
  normalize(&mut value);
  value
}

fn parse_options() -> markdown::ParseOptions {
  let mut options = markdown::ParseOptions::gfm();
  options.constructs.frontmatter = true;
  options.constructs.autolink = false;
  options.constructs.code_indented = false;
  options.constructs.html_flow = false;
  options.constructs.html_text = false;
  options.constructs.mdx_esm = true;
  options.constructs.mdx_expression_flow = true;
  options.constructs.mdx_expression_text = true;
  options.constructs.mdx_jsx_flow = true;
  options.constructs.mdx_jsx_text = true;
  options.mdx_esm_parse = Some(Box::new(crate::typescript::parse_esm));
  options.mdx_expression_parse = Some(Box::new(crate::typescript::parse_expression));
  options
}

fn format_islands(node: &Node, source: &str, width: u32) -> Result<String, FormatError> {
  // Stops describe the source slices collected by Markdown's tokenizer, including
  // offsets after list/blockquote prefixes. Replace contiguous code islands and whitespace-only indentation gaps.
  fn collect(
    value: &Value,
    source: &str,
    width: u32,
    allow_indentation_gaps: bool,
    edits: &mut Vec<(usize, usize, String)>,
  ) -> Result<(), FormatError> {
    if let Value::Object(object) = value {
      if let (Some(Value::String(code)), Some(Value::Array(stops))) =
        (object.get("value"), object.get("_markdownRsStops"))
      {
        let kind = object.get("type").and_then(Value::as_str).unwrap_or("");
        if let Some((start, end)) = code_range(code, stops, source, allow_indentation_gaps) {
          let code = &source[start..end];
          let formatted = if kind == "mdxjsEsm" {
            crate::typescript::format_module(code, width)?.trim_end().to_string()
          } else {
            crate::typescript::format_expression(code, kind == "mdxJsxExpressionAttribute", width)?
          };
          edits.push((start, end, formatted));
        }
      }
      let allow_indentation_gaps = allow_indentation_gaps
        && !matches!(
          object.get("type").and_then(Value::as_str),
          Some("listItem" | "blockquote")
        );
      for child in object.values() {
        collect(child, source, width, allow_indentation_gaps, edits)?;
      }
    } else if let Value::Array(children) = value {
      for child in children {
        collect(child, source, width, allow_indentation_gaps, edits)?;
      }
    }
    Ok(())
  }
  let mut edits = vec![];
  collect(&serde_json::to_value(node).unwrap(), source, width, true, &mut edits)?;
  edits.sort_by_key(|edit| edit.0);
  let position = node.position().unwrap();
  let mut output = String::new();
  let mut cursor = position.start.offset;
  for (start, end, formatted) in edits {
    output.push_str(&source[cursor..start]);
    output.push_str(&formatted);
    cursor = end;
  }
  output.push_str(&source[cursor..position.end.offset]);
  Ok(output)
}

// Markdown strips line indentation even from otherwise contiguous TS islands.
// Include whitespace-only gaps, but never consume list or blockquote prefixes.
fn code_range(code: &str, stops: &[Value], source: &str, allow_indentation_gaps: bool) -> Option<(usize, usize)> {
  let mut stops = stops
    .iter()
    .map(|stop| Some((stop.get(0)?.as_u64()? as usize, stop.get(1)?.as_u64()? as usize)));
  let (mut code_start, start) = stops.next()??;
  if code_start != 0 {
    return None;
  }
  let mut source_start = start;
  for stop in stops {
    let (code_end, next_source) = stop?;
    let segment = code.get(code_start..code_end)?;
    let source_end = source_start.checked_add(segment.len())?;
    if source.get(source_start..source_end)? != segment {
      return None;
    }
    let gap = source.get(source_end..next_source)?;
    if !gap.is_empty() && (!allow_indentation_gaps || !gap.bytes().all(|byte| matches!(byte, b' ' | b'\t'))) {
      return None;
    }
    code_start = code_end;
    source_start = next_source;
  }
  let segment = code.get(code_start..)?;
  let end = source_start.checked_add(segment.len())?;
  (source.get(source_start..end)? == segment).then_some((start, end))
}

// markdown-rs 1.0 mishandles padding around JSX assignment markers: tags can
// become prose, or multiline values fail to parse. Normalize candidate markers,
// then let the AST prove which edits are actually inside MDX opening tags.
// Restore every candidate in prose, code, strings, or quoted attribute values.
fn parse_source(source: &str, options: &markdown::ParseOptions) -> Result<(String, Node), FormatError> {
  let parse = |text: &str| markdown::to_mdast(text, options).map_err(|error| FormatError::Parse(error.to_string()));
  let mut candidate = String::with_capacity(source.len());
  let mut edits = Vec::new();
  let mut cursor = 0;
  for (index, _) in source.match_indices('=') {
    let start = source[..index].trim_end_matches([' ', '\t']).len();
    let end = source.len() - source[index + 1..].trim_start_matches([' ', '\t']).len();
    if (start < index || end > index + 1) && matches!(source.as_bytes().get(end), Some(b'{' | b'"' | b'\'')) {
      candidate.push_str(&source[cursor..start]);
      edits.push((start, end, candidate.len()));
      candidate.push('=');
      cursor = end;
    }
  }
  if edits.is_empty() {
    return Ok((source.into(), parse(source)?));
  }
  candidate.push_str(&source[cursor..]);
  let tree = match parse(&candidate) {
    Ok(tree) => tree,
    Err(_) => return Ok((source.into(), parse(source)?)),
  };
  let initializers = crate::mdx_whitespace::attribute_initializers(&tree, &candidate);
  let mut output = String::with_capacity(source.len());
  cursor = 0;
  for (start, end, marker) in edits {
    if initializers.contains(&marker) {
      output.push_str(&source[cursor..start]);
      output.push('=');
      cursor = end;
    }
  }
  output.push_str(&source[cursor..]);
  let tree = parse(&output)?;
  Ok((output, tree))
}
