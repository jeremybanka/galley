// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jeremy Banka

use markdown::mdast::Node;
use serde_json::Value;

use crate::configuration::Configuration;
use crate::FormatError;

/// Format Markdown around MDX syntax. Never send JSX or JavaScript to the HTML parser.
/// Blocks containing MDX (including their Markdown children) are preserved verbatim.
pub fn format_mdx(
  source: &str,
  config: &Configuration,
  mut format_code: impl FnMut(&str, &str, u32) -> Result<Option<String>, FormatError>,
) -> Result<Option<String>, FormatError> {
  let options = parse_options();
  let tree = markdown::to_mdast(source, &options).map_err(|error| FormatError::Parse(error.to_string()))?;
  let children = tree.children().expect("MDX document has a root");
  if children
    .iter()
    .any(|node| is_directive(node, &config.ignore_file_directive))
  {
    return Ok(None);
  }

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

  if output == source {
    return Ok(None);
  }
  // Markdown and MDX have different grammars. A formatter can, for example,
  // remove an escape before `{` or turn an email link into an HTML-like autolink.
  // Keep the original if reparsing changes the document's structure or content.
  let Ok(formatted_tree) = markdown::to_mdast(&output, &options) else {
    return Ok(None);
  };
  if semantic_tree(&tree) != semantic_tree(&formatted_tree) {
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

fn is_directive(node: &Node, directive: &str) -> bool {
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
            *text = text.replace("\r\n", "\n").replace('\n', " ");
          }
        }
        for value in object.values_mut() {
          normalize(value);
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
  // offsets after list/blockquote prefixes. Only replace contiguous code islands.
  fn collect(
    value: &Value,
    source: &str,
    width: u32,
    edits: &mut Vec<(usize, usize, String)>,
  ) -> Result<(), FormatError> {
    if let Value::Object(object) = value {
      if let (Some(Value::String(code)), Some(Value::Array(stops))) =
        (object.get("value"), object.get("_markdownRsStops"))
      {
        let kind = object.get("type").and_then(Value::as_str).unwrap_or("");
        if let Some(start) = stops
          .first()
          .and_then(|v| v.get(1))
          .and_then(Value::as_u64)
          .map(|n| n as usize)
        {
          let end = start + code.len();
          if source.get(start..end) == Some(code) {
            let formatted = if kind == "mdxjsEsm" {
              crate::typescript::format_module(code, width)?.trim_end().to_string()
            } else {
              crate::typescript::format_expression(code, kind == "mdxJsxExpressionAttribute", width)?
            };
            edits.push((start, end, formatted));
          }
        }
      }
      for child in object.values() {
        collect(child, source, width, edits)?;
      }
    } else if let Value::Array(children) = value {
      for child in children {
        collect(child, source, width, edits)?;
      }
    }
    Ok(())
  }
  let mut edits = vec![];
  collect(&serde_json::to_value(node).unwrap(), source, width, &mut edits)?;
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
