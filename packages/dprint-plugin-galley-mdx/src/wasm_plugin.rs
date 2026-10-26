// Original work: dprint-plugin-markdown (MIT), see LICENSE-MIT.
// Modifications: Copyright (c) 2026 Jeremy Banka, MPL-2.0, see LICENSE.

use std::path::PathBuf;

use dprint_core::configuration::ConfigKeyMap;
use dprint_core::configuration::GlobalConfiguration;
use dprint_core::generate_plugin_code;
use dprint_core::plugins::CheckConfigUpdatesMessage;
use dprint_core::plugins::ConfigChange;
use dprint_core::plugins::ConfigChangeKind;
use dprint_core::plugins::FileMatchingInfo;
use dprint_core::plugins::FormatError as CoreFormatError;
use dprint_core::plugins::FormatRange;
use dprint_core::plugins::FormatResult;
use dprint_core::plugins::PluginInfo;
use dprint_core::plugins::PluginResolveConfigurationResult;
use dprint_core::plugins::SyncFormatRequest;
use dprint_core::plugins::SyncHostFormatRequest;
use dprint_core::plugins::SyncPluginHandler;

use super::configuration::get_config_key_renames;
use super::configuration::resolve_config;
use super::configuration::Configuration;

struct MdxPluginHandler;

impl SyncPluginHandler<Configuration> for MdxPluginHandler {
  fn resolve_config(
    &mut self,
    config: ConfigKeyMap,
    global_config: &GlobalConfiguration,
  ) -> PluginResolveConfigurationResult<Configuration> {
    let config = resolve_config(config, global_config);
    PluginResolveConfigurationResult {
      config: config.config,
      diagnostics: config.diagnostics,
      file_matching: FileMatchingInfo {
        file_extensions: vec!["mdx".to_string()],
        file_names: vec![],
        additive: false,
      },
    }
  }

  fn check_config_updates(&self, message: CheckConfigUpdatesMessage) -> Result<Vec<ConfigChange>, CoreFormatError> {
    let mut changes = Vec::new();
    for rename in get_config_key_renames(&message.config) {
      if let Some(value) = rename.value {
        changes.push(ConfigChange {
          path: vec![rename.new_key.to_string().into()],
          kind: ConfigChangeKind::Add(value),
        });
      }
      changes.push(ConfigChange {
        path: vec![rename.old_key.to_string().into()],
        kind: ConfigChangeKind::Remove,
      });
    }
    Ok(changes)
  }

  fn plugin_info(&mut self) -> PluginInfo {
    let manifest: serde_json::Value = serde_json::from_str(include_str!("../package.json")).unwrap();
    let version = manifest["version"].as_str().unwrap().to_string();
    PluginInfo {
      name: env!("CARGO_PKG_NAME").to_string(),
      version: version.clone(),
      config_key: "mdx".to_string(),
      help_url: "https://github.com/jeremybanka/galley/tree/main/packages/dprint-plugin-galley-mdx".to_string(),
      config_schema_url: format!("https://unpkg.com/dprint-plugin-galley-mdx@{}/schema.json", version),
      update_url: None,
    }
  }

  fn license_text(&mut self) -> String {
    concat!(
      include_str!("../LICENSE"),
      "\n",
      include_str!("../LICENSE-MIT"),
      "\n",
      include_str!("../THIRD_PARTY_NOTICES.md"),
      "\n",
      include_str!("../DEPENDENCY_NOTICES.txt")
    )
    .into()
  }

  fn format(
    &mut self,
    request: SyncFormatRequest<Configuration>,
    mut format_with_host: impl FnMut(SyncHostFormatRequest) -> FormatResult,
  ) -> FormatResult {
    // Partial Markdown ranges can split MDX expressions or JSX containers.
    if request.range.is_some() {
      return Ok(None);
    }
    let file_text = String::from_utf8(request.file_bytes)?;
    let config = request.config.clone();
    let format_code_block_text = |tag: &str, file_text: &str, line_width: u32| {
      if let Some(ext) = tag_to_extension(tag, &config) {
        let file_path = PathBuf::from(format!("file.{}", ext));
        let mut additional_config = ConfigKeyMap::new();
        additional_config.insert("lineWidth".into(), (line_width as i32).into());
        if let Some(use_tabs) = config.code_block_use_tabs {
          additional_config.insert("useTabs".into(), use_tabs.into());
        }
        if let Some(indent_width) = config.code_block_indent_width {
          additional_config.insert("indentWidth".into(), (indent_width as i32).into());
        }
        let request = SyncHostFormatRequest {
          file_path: &file_path,
          file_bytes: file_text.as_bytes(),
          range: FormatRange::None,
          override_config: &additional_config,
        };
        let result = format_with_host(request);
        match result {
          Ok(Some(bytes)) => Ok(Some(String::from_utf8(bytes)?)),
          Ok(None) => Ok(None),
          Err(err) => Err(super::FormatError::CodeBlock(err.into())),
        }
      } else {
        Ok(None)
      }
    };
    return super::format_mdx(&file_text, request.config, format_code_block_text)
      .map(|maybe_text| maybe_text.map(|t| t.into_bytes()))
      .map_err(CoreFormatError::new);

    fn tag_to_extension<'a>(tag: &str, config: &'a Configuration) -> Option<&'a str> {
      let tag_lower = tag.trim().to_lowercase();

      // a tag the configuration maps takes precedence over the built-in ones
      if let Some(ext) = config.tags.get(&tag_lower) {
        return Some(ext);
      }

      crate::code_block_tags::tag_to_extension(&tag_lower)
    }
  }
}

generate_plugin_code!(MdxPluginHandler, MdxPluginHandler);
