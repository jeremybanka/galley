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
  let mut options = mdxjs::Options::gfm();
  options.parse.constructs.frontmatter = true;
  let tree = mdxjs::mdast_util_from_mdx(source, &options).map_err(|error| FormatError::Parse(error.to_string()))?;
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
      output.push_str(&source[position.start.offset..position.end.offset]);
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
  let Ok(formatted_tree) = mdxjs::mdast_util_from_mdx(&output, &options) else {
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
