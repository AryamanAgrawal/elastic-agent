export const CODEBASE_INDEX_NAME = 'codebase-store';

export const CODEBASE_INDEX_CONFIG: any = {
  settings: {
    analysis: {
      char_filter: {
        code_char_filter: {
          type: "pattern_replace",
          pattern: "([a-z])([A-Z])",
          replacement: "$1 $2",
        },
        path_char_filter: {
          type: "pattern_replace",
          pattern: "[/.]",
          replacement: "_",
        },
      },
      filter: {
        code_split_with_paths: {
          type: "word_delimiter",
          generate_word_parts: true,
          generate_number_parts: true,
          catenate_words: true,
          catenate_numbers: true,
          split_on_case_change: true,
          split_on_numerics: true,
          preserve_original: false,
        },
      },
      analyzer: {
        code_analyzer: {
          type: "custom",
          char_filter: ["path_char_filter", "code_char_filter"],
          tokenizer: "standard",
          filter: ["lowercase", "code_split_with_paths"],
        },
      },
    },
  },
  mappings: {
    properties: {
      name: {
        type: "text",
        analyzer: "code_analyzer",
        fields: {
          raw: { type: "keyword" },
        },
      },
      content: {
        type: "text",
        analyzer: "code_analyzer",
        fields: {
          raw: { type: "text", analyzer: "standard" },
        },
      },
      repository: { type: "keyword" },
      file_path: { type: "keyword" },
      extension: { type: "keyword" },
      element_id: { type: "keyword" },
      element_type: { type: "keyword" }, // function, class, variable, etc.
      metadata: { type: "object" },
      created_at: { type: "date" },
      updated_at: { type: "date" },
    },
  },
};