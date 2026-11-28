// 🚧 기간 작업 메시지 읽기 시험 (11/28 시설팀 카톡: 17호 라인 · 머리말 줄 · 판매 날짜) — node test/blocks_parse_test.mjs
import { parseMsg } from '../blocks.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m); };
const T = `-17호라인 침대증설작업(거울이동 및 벽체공사)

-일자: 12/13(일)~12/17(목) _작업 및 미판매 / 12/18(금)부터 판매가능

-호실: 17호 라인 전체(23,24층 제외)



-17호라인 침대증설작업(침대 및 화장대 설치)

-일자: 12/22(화)~12/23(수) _작업 및 미판매 / 12/24(목)부터 판매가능

-호실: 17호 라인 전체(23,24층 제외)`;
const g = parseMsg(T, '2026-11-28');
ok(g.length === 2, '작업 2건 (' + g.length + ')');
ok(g[0].name.includes('거울이동') && g[0].from === '2026-12-13' && g[0].to === '2026-12-17', '1건: 거울이동 12/13~12/17 (판매 12/18 빼고)');
ok(g[1].name.includes('화장대') && g[1].from === '2026-12-22' && g[1].to === '2026-12-23', '2건: 화장대 12/22~12/23');
ok(g.every(x => x.rooms.length === 20 && !x.rooms.includes('2317') && !x.rooms.includes('2417') && x.rooms.includes('517') && x.rooms.includes('2617')), '각 20실 · 2317 · 2417 빠짐');
const h = parseMsg('17라인 5~10층 도배 12/1~12/3', '2026-11-28')[0];
ok(h && h.rooms.join() === '517,617,717,817,917,1017' && h.from === '2026-12-01' && h.to === '2026-12-03', '17라인 5~10층');
const k = parseMsg('1305~1311 카펫 교체 12/2', '2026-11-28')[0];
ok(k && k.rooms.length === 7 && k.from === '2026-12-02', '예전 형식 그대로 (1305~1311)');
console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
