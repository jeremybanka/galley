// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jeremy Banka

use crate::FormatError;
use deno_ast::swc::ast::{Decl, Expr, ModuleItem, PropOrSpread, Stmt};
use deno_ast::{MediaType, ParseParams, ParsedSource, ProgramRef, SourceRangedForSpanned, StartSourcePos};
use markdown::{MdxExpressionKind, MdxSignal};

const PREFIX: &str = "const __galley_value = ";

fn parse(source: &str) -> Result<ParsedSource, deno_ast::ParseDiagnostic> {
  let parsed = deno_ast::parse_module(ParseParams {
    specifier: deno_ast::ModuleSpecifier::parse("file:///galley.tsx").unwrap(),
    text: source.into(),
    media_type: MediaType::Tsx,
    capture_tokens: false,
    scope_analysis: false,
    maybe_syntax: None,
  })?;
  if let Some(error) = parsed.diagnostics().first() {
    return Err(error.clone());
  }
  Ok(parsed)
}

fn error(message: String, offset: usize, len: usize) -> MdxSignal {
  if offset >= len {
    MdxSignal::Eof(message, Box::new("galley".into()), Box::new("typescript".into()))
  } else {
    MdxSignal::Error(
      message,
      offset,
      Box::new("galley".into()),
      Box::new("typescript".into()),
    )
  }
}

fn diagnostic_signal(failure: deno_ast::ParseDiagnostic, prefix: usize, length: usize) -> MdxSignal {
  let end = (failure.range().end - StartSourcePos::START_SOURCE_POS).saturating_sub(prefix);
  let incomplete = end >= length
    || failure.to_string().contains("<eof>")
    || matches!(
      failure.kind(),
      deno_ast::swc::parser::error::SyntaxError::UnterminatedBlockComment
        | deno_ast::swc::parser::error::SyntaxError::UnterminatedStrLit
        | deno_ast::swc::parser::error::SyntaxError::UnterminatedRegExp
        | deno_ast::swc::parser::error::SyntaxError::UnterminatedTpl
        | deno_ast::swc::parser::error::SyntaxError::UnterminatedJSXContents
    );
  error(
    failure.to_string(),
    if incomplete {
      length
    } else {
      (failure.range().start - StartSourcePos::START_SOURCE_POS).saturating_sub(prefix)
    },
    length,
  )
}

pub fn parse_esm(value: &str) -> MdxSignal {
  match parse(value) {
    Ok(parsed) => {
      let ProgramRef::Module(module) = parsed.program_ref() else {
        unreachable!()
      };
      for item in &module.body {
        if !matches!(item, ModuleItem::ModuleDecl(_)) {
          return error(
            "Only import and export declarations start MDX code blocks.".into(),
            item.start() - StartSourcePos::START_SOURCE_POS,
            value.len(),
          );
        }
      }
      MdxSignal::Ok
    }
    // ESM candidates arrive at blank lines. SWC sometimes points to an earlier
    // token when a trailing comment/template is incomplete. Retry syntax failures
    // until the candidate parses; non-module statements are still rejected above.
    Err(failure) => error(failure.to_string(), value.len(), value.len()),
  }
}

fn empty(value: &str) -> bool {
  parse(value).is_ok_and(|parsed| {
    matches!(parsed.program_ref(), ProgramRef::Module(module) if module.body.is_empty())
      && !parsed.comments().get_vec().iter().any(|comment| {
        matches!(comment.kind, deno_ast::swc::common::comments::CommentKind::Line)
          && comment.span.hi.0 as usize == value.len() + 1
      })
  })
}

pub fn parse_expression(value: &str, kind: &MdxExpressionKind) -> MdxSignal {
  if matches!(kind, MdxExpressionKind::Expression) && empty(value) {
    return MdxSignal::Ok;
  }
  let spread = matches!(kind, MdxExpressionKind::AttributeExpression);
  let prefix = if spread {
    format!("{PREFIX}({{")
  } else {
    format!("{PREFIX}(")
  };
  let source = format!("{prefix}{value}{});", if spread { "}" } else { "" });
  match parse(&source) {
    Err(failure) => diagnostic_signal(failure, prefix.len(), value.len()),
    Ok(parsed) => {
      let ProgramRef::Module(module) = parsed.program_ref() else {
        unreachable!()
      };
      if module.body.len() == 1 {
        if let ModuleItem::Stmt(Stmt::Decl(Decl::Var(var))) = &module.body[0] {
          if var.decls.len() == 1 {
            if let Some(expr) = &var.decls[0].init {
              if let Expr::Paren(paren) = &**expr {
                if !spread {
                  return MdxSignal::Ok;
                }
                if matches!(&*paren.expr, Expr::Object(obj) if obj.props.len() == 1 && matches!(&obj.props[0], PropOrSpread::Spread(_)))
                {
                  return MdxSignal::Ok;
                }
              }
            }
          }
        }
      }
      error(
        "Expected one TypeScript expression (or one spread attribute).".into(),
        0,
        value.len(),
      )
    }
  }
}

pub fn format_module(source: &str, width: u32) -> Result<String, FormatError> {
  use dprint_plugin_typescript::configuration::{SameOrNextLinePosition, UseParentheses};
  // Choose layout from syntax and width rather than retaining authored wrapping.
  // Keep this policy shared by module/expression formatting and semantic checks.
  let config = dprint_plugin_typescript::configuration::ConfigurationBuilder::new()
    .line_width(width)
    .prefer_single_line(true)
    .binary_expression_line_per_expression(true)
    .conditional_expression_line_per_expression(true)
    .member_expression_line_per_expression(true)
    .arrow_function_use_parentheses(UseParentheses::Force)
    .single_body_position(SameOrNextLinePosition::SameLine)
    .build();
  // Adding parentheses or moving a chain can change the supplier's subsequent
  // width decisions. Reach its fixed point here, not on the user's next save.
  let mut current = source.to_string();
  for _ in 0..8 {
    let next = dprint_plugin_typescript::format_text(dprint_plugin_typescript::FormatTextOptions {
      path: std::path::Path::new("galley.tsx"),
      extension: None,
      text: current.clone(),
      config: &config,
      external_formatter: None,
    })
    .map_err(|error| FormatError::Parse(error.to_string()))?;
    match next {
      None => return Ok(current),
      Some(next) if next == current => return Ok(current),
      Some(next) => current = next,
    }
  }
  Err(FormatError::Parse(
    "Embedded TypeScript formatting did not stabilize after eight passes.".into(),
  ))
}

pub fn format_expression(source: &str, spread: bool, width: u32) -> Result<String, FormatError> {
  if !spread && empty(source) {
    return Ok(format_module(source, width)?.trim().into());
  }
  let wrapper = if spread {
    format!("{PREFIX}{{{source}}};")
  } else {
    format!("{PREFIX}({source});")
  };
  let formatted = format_module(&wrapper, width)?;
  let value = formatted
    .strip_prefix(PREFIX.trim_end())
    .ok_or_else(|| FormatError::Parse("Unexpected expression formatter output".into()))?
    .trim_end()
    .trim_end_matches(';')
    .trim();
  if spread {
    Ok(
      value
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .ok_or_else(|| FormatError::Parse("Unexpected spread formatter output".into()))?
        .trim()
        .trim_end_matches(',')
        .into(),
    )
  } else {
    Ok(value.into())
  }
}
