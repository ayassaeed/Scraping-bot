import { Parser as Json2CsvParser } from 'json2csv';

export async function formatOutput(items, format) {
  if (!items.length) return format === 'json' ? '[]' : '';
  switch (format) {
    case 'json': return JSON.stringify(items, null, 2);
    case 'csv': {
      try {
        return new Json2CsvParser({ fields: Object.keys(items[0]) }).parse(items);
      } catch { return items.map(i => Object.values(i).join(',')).join('\n'); }
    }
    case 'markdown': {
      const h = Object.keys(items[0]);
      return [`| ${h.join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`,
        ...items.map(i => `| ${h.map(k => String(i[k] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
    }
    default:
      return items.map((i, n) => `[${n + 1}]\n${Object.entries(i).map(([k, v]) => `  ${k}: ${v ?? ''}`).join('\n')}`).join('\n\n');
  }
}
