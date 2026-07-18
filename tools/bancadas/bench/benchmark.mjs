/* benchmark.mjs — mede QUAIS ferramentas de senso crítico ajudam (D-60).
   Casos = peças reais × (limpo + cada defeito plantado). Cada ferramenta é
   pontuada: pega os defeitos DO SEU domínio (recall) sem alarme falso em limpo
   ou em defeito de outro domínio (precision). F1 = ajuda ou não.
     node tools/bancadas/bench/benchmark.mjs            # tudo
     node tools/bancadas/bench/benchmark.mjs --verbose  # + cada finding
     node tools/bancadas/bench/benchmark.mjs --tool=lint-de-malha */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { construirPeca, pixels } from './sandbox.mjs';
import { MUT } from './mutacoes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const only = /--tool=(.+)/.exec(args.find((a) => a.startsWith('--tool=')) || '')?.[1];
const BASES = ['arvore3d', 'ilha-chao', 'casa-toras'];
const BAR = 0.80;  // régua de "ajuda" (F1)

/* 1 · descobre ferramentas */
const tools = [];
for (const fn of readdirSync(join(HERE, 'tools')).filter((f) => f.endsWith('.mjs'))) {
  const m = await import(pathToFileURL(join(HERE, 'tools', fn)));
  if (m.analisar && m.dom) tools.push({ id: m.id || fn, dom: m.dom, analisar: m.analisar });
}
const use = only ? tools.filter((t) => t.id === only) : tools;

/* 2 · monta casos */
const casos = [];
for (const base of BASES) {
  casos.push({ id: `${base} · limpo`, base, dom: 'clean', mut: null });
  for (const [mid, m] of Object.entries(MUT)) casos.push({ id: `${base} · ${mid}`, base, dom: m.dom, mut: m.fn });
}

/* 3 · roda tudo (constrói cada caso fresco) */
const score = new Map(use.map((t) => [t.id, { dom: t.dom, tp: 0, fp: 0, fn: 0, tn: 0, fpCasos: [], fnCasos: [] }]));
for (const c of casos) {
  const { built, erro } = await construirPeca(c.base, { mut: c.mut });
  for (const t of use) {
    let flagged, findings = [];
    if (erro) { flagged = true; findings = [{ sev: 'erro', msg: 'construir lançou: ' + erro.message }]; }
    else { try { findings = t.analisar(built, { pixels }) || []; } catch (e) { findings = [{ sev: 'erro', msg: 'ferramenta quebrou: ' + e.message }]; } flagged = findings.length > 0; }
    const pos = c.dom === t.dom, s = score.get(t.id);
    if (flagged && pos) s.tp++; else if (flagged && !pos) { s.fp++; s.fpCasos.push(c.id); } else if (!flagged && pos) { s.fn++; s.fnCasos.push(c.id); } else s.tn++;
    if (verbose && findings.length) console.log(`  [${t.id}] ${c.id}: ${findings.map((x) => x.msg).join(' | ')}`);
  }
}

/* 4 · placar */
console.log(`\n${casos.length} casos (${BASES.length} peças × ${1 + Object.keys(MUT).length}) · ${use.length} ferramenta(s)\n`);
console.log('ferramenta'.padEnd(26), 'dom'.padEnd(9), 'TP FN FP', ' prec  rec   F1   veredito');
const resumo = [];
for (const [id, s] of score) {
  const prec = s.tp + s.fp ? s.tp / (s.tp + s.fp) : 1, rec = s.tp + s.fn ? s.tp / (s.tp + s.fn) : 1;
  const f1 = prec + rec ? 2 * prec * rec / (prec + rec) : 0;
  const ok = f1 >= BAR;
  console.log(id.padEnd(26), s.dom.padEnd(9), `${String(s.tp).padStart(2)} ${String(s.fn).padStart(2)} ${String(s.fp).padStart(2)}`, ` ${prec.toFixed(2)}  ${rec.toFixed(2)}  ${f1.toFixed(2)}  ${ok ? '✅ ajuda' : '❌ NÃO'}`);
  resumo.push({ id, dom: s.dom, f1, ok, fp: s.fpCasos, fn: s.fnCasos });
}
const ruins = resumo.filter((r) => !r.ok);
if (ruins.length) {
  console.log('\n— não bateram a régua (F1<' + BAR + '):');
  for (const r of ruins) console.log(`  ${r.id}: F1=${r.f1.toFixed(2)}` + (r.fn.length ? ` · perdeu ${r.fn.length} defeito(s)` : '') + (r.fp.length ? ` · ${r.fp.length} alarme(s) falso(s): ${r.fp.slice(0, 3).join(', ')}${r.fp.length > 3 ? '…' : ''}` : ''));
}
console.log('');
