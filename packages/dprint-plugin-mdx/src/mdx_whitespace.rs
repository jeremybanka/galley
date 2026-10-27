// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jeremy Banka

use dprint_core::configuration::resolve_new_line_kind;
use markdown::mdast::Node;
use serde_json::Value;

use crate::configuration::Configuration;

struct Span {
  start: usize,
  end: usize,
  replacement: Option<String>,
}

/// Normalize layout outside literal contents, executable islands, and ignore regions.
/// The caller reparses and checks the resulting MDX tree before accepting edits.
pub fn normalize(source: &str, tree: &Node, config: &Configuration) -> String {
  let newline = resolve_new_line_kind(source, config.new_line_kind);
  let mut spans = Vec::new();
  fn preserve(node: &Node, spans: &mut Vec<Span>) {
    let position = node.position().unwrap();
    spans.push(Span {
      start: position.start.offset,
      end: position.end.offset,
      replacement: None,
    });
  }
  fn collect(node: &Node, spans: &mut Vec<Span>, newline: &str) {
    if matches!(
      node,
      Node::Code(_)
        | Node::Image(_)
        | Node::ImageReference(_)
        | Node::Definition(_)
        | Node::InlineCode(_)
        | Node::Yaml(_)
        | Node::Toml(_)
        | Node::MdxjsEsm(_)
        | Node::MdxFlowExpression(_)
        | Node::MdxTextExpression(_)
    ) {
      preserve(node, spans);
      return;
    }
    let name = match node {
      Node::MdxJsxFlowElement(element) => element.name.as_deref(),
      Node::MdxJsxTextElement(element) => element.name.as_deref(),
      _ => None,
    };
    if matches!(name, Some("pre" | "code" | "textarea" | "script" | "style")) {
      preserve(node, spans);
      return;
    }
    if let Node::Break(_) = node {
      let position = node.position().unwrap();
      spans.push(Span {
        start: position.start.offset,
        end: position.end.offset,
        replacement: Some(format!("\\{newline}")),
      });
    }
    if matches!(node, Node::Link(_) | Node::LinkReference(_)) {
      let position = node.position().unwrap();
      let end = node
        .children()
        .and_then(|children| children.last())
        .and_then(Node::position)
        .map_or(position.start.offset, |position| position.end.offset);
      spans.push(Span {
        start: end,
        end: position.end.offset,
        replacement: None,
      });
    }
    for child in node.children().into_iter().flatten() {
      collect(child, spans, newline);
    }
  }
  let mut ignore_next = false;
  let mut ignore_start = None;
  for node in tree.children().into_iter().flatten() {
    let position = node.position().unwrap();
    if super::mdx::is_directive(node, &config.ignore_start_directive) && ignore_start.is_none() {
      ignore_start = Some(position.start.offset);
    }
    if ignore_next {
      preserve(node, &mut spans);
    }
    if super::mdx::is_directive(node, &config.ignore_end_directive) {
      if let Some(start) = ignore_start.take() {
        spans.push(Span {
          start,
          end: position.end.offset,
          replacement: None,
        });
      }
    }
    ignore_next = super::mdx::is_directive(node, &config.ignore_directive);
    collect(node, &mut spans, newline);
  }
  if let Some(start) = ignore_start {
    spans.push(Span {
      start,
      end: source.len(),
      replacement: None,
    });
  }

  // Attribute expressions lack ordinary positions. Tokenizer stops also account
  // for the source prefixes of expressions inside Markdown lists and blockquotes.
  expressions(&serde_json::to_value(tree).unwrap(), &mut spans);

  // Quoted JSX attributes are literal data, not inter-attribute whitespace.
  let mut tags = Vec::new();
  attributes(tree, source, &mut spans, &mut tags, &mut Vec::new());
  for &(start, end) in &tags {
    let tag = &source[start..end];
    if let Some(body) = tag.strip_prefix('<').and_then(|tag| tag.strip_suffix("/>")) {
      let name = body.trim();
      if !name.is_empty() && !name.chars().any(char::is_whitespace) && !name.contains(['{', '=', '\'', '"']) {
        // No props: all three spellings `<Name/>`, `<Name />`, and a wrapped
        // closing marker have the same canonical layout, regardless of width.
        spans.push(Span {
          start,
          end,
          replacement: Some(format!("<{name} />")),
        });
      } else if !tag.contains(['\r', '\n']) {
        // Inline props still need exactly one space before the closing marker.
        let closing_start = end - 2;
        let space_start = source[..closing_start].trim_end_matches([' ', '\t']).len();
        spans.push(Span {
          start: space_start,
          end,
          replacement: Some(" />".into()),
        });
      }
    }
  }
  spans.sort_by_key(|span| (span.start, std::cmp::Reverse(span.end)));

  let bytes = source.as_bytes();
  let mut output = String::with_capacity(source.len());
  let mut i = 0;
  let mut ranges = spans.iter().peekable();
  while i < bytes.len() {
    while ranges.peek().is_some_and(|span| span.end <= i) {
      ranges.next();
    }
    if let Some(span) = ranges.peek().filter(|span| span.start <= i) {
      output.push_str(span.replacement.as_deref().unwrap_or(&source[i..span.end]));
      i = span.end;
      ranges.next();
      continue;
    }
    let limit = ranges.peek().map_or(bytes.len(), |span| span.start);
    let in_tag = tags.iter().any(|&(start, end)| start <= i && i < end);
    if matches!(bytes[i], b' ' | b'\t') {
      let start = i;
      while i < limit && matches!(bytes[i], b' ' | b'\t') {
        i += 1;
      }
      let trailing = i == bytes.len() || matches!(bytes.get(i), Some(b'\r' | b'\n'));
      let line_start = source[..start].rfind('\n').map_or(0, |index| index + 1);
      let indentation = source[line_start..start]
        .bytes()
        .all(|byte| matches!(byte, b' ' | b'\t'));
      let around_equals = in_tag && (bytes.get(i) == Some(&b'=') || start > 0 && bytes[start - 1] == b'=');
      if !trailing && !around_equals {
        output.push_str(if indentation { &source[start..i] } else { " " });
      }
    } else if matches!(bytes[i], b'\r' | b'\n') {
      let mut count = 0;
      loop {
        if bytes[i] == b'\r' && bytes.get(i + 1) == Some(&b'\n') {
          i += 1;
        }
        i += 1;
        count += 1;
        let mut next = i;
        while next < limit && matches!(bytes[next], b' ' | b'\t') {
          next += 1;
        }
        if next == bytes.len() {
          i = next;
          break;
        }
        if next < limit && matches!(bytes[next], b'\r' | b'\n') {
          i = next;
        } else {
          break;
        }
      }
      if !output.is_empty() {
        for _ in 0..if i == bytes.len() {
          1
        } else {
          count.min(if in_tag { 1 } else { 2 })
        } {
          output.push_str(newline);
        }
      }
    } else {
      let ch = source[i..].chars().next().unwrap();
      output.push(ch);
      i += ch.len_utf8();
    }
  }
  if !output.is_empty() && !output.ends_with('\n') {
    output.push_str(newline);
  }
  output
}

fn expressions(value: &Value, spans: &mut Vec<Span>) {
  if let Value::Object(object) = value {
    if let (Some(Value::String(code)), Some(Value::Array(stops))) =
      (object.get("value"), object.get("_markdownRsStops"))
    {
      if let (Some(first), Some(last)) = (stops.first(), stops.last()) {
        if let (Some(start), Some(end), Some(index)) = (
          first.get(1).and_then(Value::as_u64),
          last.get(1).and_then(Value::as_u64),
          last.get(0).and_then(Value::as_u64),
        ) {
          spans.push(Span {
            start: start as usize,
            end: end as usize + code.len() - index as usize,
            replacement: None,
          });
        }
      }
    }
    for value in object.values() {
      expressions(value, spans);
    }
  } else if let Value::Array(values) = value {
    for value in values {
      expressions(value, spans);
    }
  }
}

fn attributes(
  node: &Node,
  source: &str,
  spans: &mut Vec<Span>,
  tags: &mut Vec<(usize, usize)>,
  initializers: &mut Vec<usize>,
) {
  if matches!(node, Node::MdxJsxFlowElement(_) | Node::MdxJsxTextElement(_)) {
    let position = node.position().unwrap();
    let bytes = source.as_bytes();
    let mut i = position.start.offset;
    while i < position.end.offset {
      if let Some(end) = spans
        .iter()
        .filter(|span| span.start <= i && i < span.end)
        .map(|span| span.end)
        .max()
      {
        i = end;
      } else if bytes[i] == b'>' {
        tags.push((position.start.offset, i + 1));
        break;
      } else if matches!(bytes[i], b'\'' | b'"') {
        let start = i;
        let quote = bytes[i];
        i += 1;
        while i < position.end.offset && bytes[i] != quote {
          i += 1;
        }
        i += 1;
        spans.push(Span {
          start,
          end: i,
          replacement: None,
        });
      } else {
        if bytes[i] == b'=' {
          initializers.push(i);
        }
        i += 1;
      }
    }
  }
  for child in node.children().into_iter().flatten() {
    attributes(child, source, spans, tags, initializers);
  }
}

/// Assignment markers proven to be in MDX opening tags, outside code and literals.
pub fn attribute_initializers(tree: &Node, source: &str) -> Vec<usize> {
  let mut spans = Vec::new();
  expressions(&serde_json::to_value(tree).unwrap(), &mut spans);
  let mut initializers = Vec::new();
  attributes(tree, source, &mut spans, &mut Vec::new(), &mut initializers);
  initializers
}
