const extensionMap: Record<string, string> = {
  // Web
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  vue: 'html',
  svelte: 'html',

  // Data
  json: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'ini',
  ini: 'ini',

  // Programming
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  r: 'r',
  dart: 'dart',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',

  // Config / DevOps
  dockerfile: 'dockerfile',
  tf: 'hcl',

  // Markup / Docs
  md: 'markdown',
  mdx: 'markdown',
  tex: 'latex',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
}

export function detectLanguage(filename: string): string {
  const name = filename.toLowerCase()

  // Handle dotfiles
  if (name === 'dockerfile' || name === 'makefile' || name === 'cmakelists.txt') {
    return extensionMap[name] ?? 'plaintext'
  }

  const ext = name.split('.').pop() ?? ''
  return extensionMap[ext] ?? 'plaintext'
}
