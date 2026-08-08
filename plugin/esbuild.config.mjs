import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import process from 'process';
import builtins from 'builtin-modules';

const prod = process.argv[2] === 'production';

/**
 * Obsidian требует один styles.css в корне плагина, а правило проекта — файлы
 * не длиннее 150 строк. Поэтому стили лежат в styles/ по разделам, а корневой
 * styles.css собирается из них склейкой и правится только через них.
 */
const STYLE_PARTS = ['status.css', 'cards.css', 'panel.css', 'modal.css', 'members.css'];

function buildStyles() {
  const head = '/* Собирается из styles/*.css, правьте их. Только переменные Obsidian. */\n';
  const body = STYLE_PARTS.map((name) => readFileSync(`styles/${name}`, 'utf8').trim()).join('\n\n');
  writeFileSync('styles.css', `${head}\n${body}\n`);
}

buildStyles();

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
