/* benchmark.mjs — mede QUAIS ferramentas de senso crítico ajudam (D-60).
   Casos = peças reais × (limpo + cada defeito plantado). Separa NÚCLEO (defeito
   real/óbvio) de ADVERSARIAL (a versão sutil = piso de sensibilidade). O
   veredito vem do NÚCLEO (a ferramenta gateia o defeito que acontece?); a
   coluna sutil mostra onde ela é fraca — floor honesto, não reprovação.
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
const BAR = 0.80;

/* 1 · descobre ferramentas */
const tools = [];
for (const fn of readdirSync(join(HERE, 'tools')).filter((f) => f.endsWith('.mjs'))) {
  const m = await import(pathToFileURL(join(HERE, 'tools', fn)));
  if (m.analisar && m.dom) tools.push({ id: m.id || fn, dom: m.dom, analisar: m.analisar });
}
const use = (only ? tools.filter((t) => t.id === only) : tools).sort((a, b) => a.id.localeCompare(b.id));

/* 2 · monta casos (marca dif = adversarial) */
const casos = [];
for (const base of BASES) {
  casos.push({ id: `${base} · limpo`, base, dom: 'clean', mut: null, dif: false });
  for (const [mid, m] of Object.entries(MUT)) casos.push({ id: `${base} · ${mid}`, base, dom: m.dom, mut: m.fn, dif: !!m.dificil });
}
const nAdv = Object.values(MUT).filter((m) => m.dificil).length;

/* 3 · roda tudo; guarda por ferramenta um registro por caso */
const rec = new Map(use.map((t) => [t.id, { dom: t.dom, casos: [] }]));
for (const c of casos) {
  const { built, erro } = await construirPeca(c.base, { mut: c.mut });
  for (const t of use) {
    let findings = [];
    if (erro) findings = [{ sev: 'erro', msg: 'construir lançou: ' + erro.message }];
    else { try { findings = t.analisar(built, { pixels }) || []; } catch (e) { findings = [{ sev: 'erro', msg: 'ferramenta quebrou: ' + e.message }]; } }
    const flagged = findings.length > 0, pos = c.dom === t.dom;
    rec.get(t.id).casos.push({ id: c.id, pos, flagged, dif: c.dif });
    if (verbose && findings.length) console.log(`  [${t.id}] ${c.id}: ${findings.map((x) => x.msg).join(' | ')}`);
  }
}

/* 4 · pontua (F1 sobre um subconjunto de registros) */
const f1 = (rs) => {
  let tp = 0, fp = 0, fn = 0;
  for (const r of rs) { if (r.flagged && r.pos) tp++; else if (r.flagged && !r.pos) fp++; else if (!r.flagged && r.pos) fn++; }
  const prec = tp + fp ? tp / (tp + fp) : 1, r = tp + fn ? tp / (tp + fn) : 1;
  return { tp, fp, fn, prec, rec: r, f1: prec + r ? 2 * prec * r / (prec + r) : 0 };
};

console.log(`\n${casos.length} casos (${BASES.length} peças × ${1 + Object.keys(MUT).length}) · ${use.length} ferramenta(s) · ${nAdv} defeito(s) adversarial(is)\n`);
console.log('ferramenta'.padEnd(27), 'domínio'.padEnd(9), 'NÚCLEO F1  veredito     | sutil (adversarial)');
const listinha = [];
for (const [id, s] of rec) {
  const nuc = f1(s.casos.filter((c) => !c.dif));
  const advPos = s.casos.filter((c) => c.dif && c.pos), advFP = s.casos.filter((c) => c.dif && !c.pos && c.flagged);
  const advCaught = advPos.filter((c) => c.flagged).length;
  const ok = nuc.f1 >= BAR;
  const sutil = advPos.length ? `pega ${advCaught}/${advPos.length}` + (advFP.length ? `, +${advFP.length} FP` : '') : (advFP.length ? `${advFP.length} FP` : '—');
  console.log(id.padEnd(27), s.dom.padEnd(9), `${nuc.f1.toFixed(2)}       ${ok ? '✅ ajuda' : '❌ NÃO  '}   | ${sutil}`);
  const limites = [];
  if (advPos.length && advCaught < advPos.length) limites.push(`perde o ${s.dom} sutil (${advPos.length - advCaught}/${advPos.length})`);
  if (advFP.length) limites.push(`${advFP.length} alarme(s) sob caso adversarial de outro domínio`);
  if (!ok) limites.unshift(`NÚCLEO abaixo da régua (F1=${nuc.f1.toFixed(2)})`);
  if (limites.length) listinha.push({ id, ok, limites });
}
if (listinha.length) {
  console.log('\n— limites honestos (piso de cada ferramenta):');
  for (const r of listinha) console.log(`  ${r.ok ? '•' : '✗'} ${r.id}: ${r.limites.join(' · ')}`);
}
console.log('');
