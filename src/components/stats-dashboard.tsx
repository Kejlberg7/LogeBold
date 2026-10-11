"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { formatDate, formatDateLong } from "@/lib/dates";
import { formatOre, formatOreBare } from "@/lib/money";
import type { StatsHistory, StatsPoint } from "@/lib/stats";
import styles from "./stats-dashboard.module.css";

const COLORS = ["#d76a43", "#367eab", "#8d68bc", "#278879", "#ae7b1c", "#b95b84", "#647b35", "#6975bc"];
const shortDate = (day: string) => formatDate(new Date(`${day}T12:00:00Z`));
const longDate = (day: string) => formatDateLong(new Date(`${day}T12:00:00Z`));
const EMPTY_MEMBER = { chargedOre: 0, paidOre: 0 };
const colorStyle = (color: string) => ({ "--series": color }) as CSSProperties;

type Series = { id: string; name: string; color: string; values: number[] };
type Metric = "chargedOre" | "paidOre";

function HistoryChart({ points, series, index, onSelect }: {
  points: StatsPoint[]; series: Series[]; index: number; onSelect: (index: number) => void;
}) {
  const id = useId();
  const chart = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    if (chart.current) observer.observe(chart.current);
    return () => observer.disconnect();
  }, []);
  const height = 260, left = 64, right = 18, top = 20, bottom = 35;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const allValues = series.flatMap((line) => line.values);
  const minimum = Math.min(0, ...allValues);
  const maximum = Math.max(100, ...allValues);
  const x = (i: number) => left + (i / Math.max(1, points.length - 1)) * plotWidth;
  const y = (value: number) => top + (maximum - value) / (maximum - minimum) * plotHeight;
  const cursor = hover ?? index;
  const dateTicks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const pointAt = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(points.length - 1, Math.round(((event.clientX - box.left) / box.width * width - left) / plotWidth * (points.length - 1))));
  };

  return (
    <div>
      <div className={styles.chartReadout} aria-live="off">
        <span className={styles.chartDate}>{longDate(points[cursor].day)}</span>
        {series.map((line) => <span key={line.id} className={styles.legendValue}>
          <i style={{ background: line.color }} /><span>{line.name}</span><b className="num">{formatOre(line.values[cursor])}</b>
        </span>)}
      </div>
      <svg ref={chart} viewBox={`0 0 ${width} ${height}`} className={styles.historyChart}
        role="img" aria-label={`Udvikling over tid. ${series.map((line) => `${line.name}: ${formatOre(line.values[index])}`).join(". ")}. Vælg dato med tidslinjen.`}
        onPointerMove={(event) => setHover(pointAt(event))} onPointerLeave={() => setHover(null)}
        onClick={(event) => onSelect(pointAt(event))}>
        <defs>
          <clipPath id={`${id}-reveal`}><rect x={left - 5} y="0" width={x(index) - left + 10} height={height} className={styles.reveal} /></clipPath>
          {series.map((line) => <linearGradient key={line.id} id={`${id}-${line.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={line.color} stopOpacity="0.18" /><stop offset="100%" stopColor={line.color} stopOpacity="0.01" />
          </linearGradient>)}
        </defs>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = Math.round(minimum + (maximum - minimum) * tick / 4);
          return <g key={tick}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--rule-soft)" strokeDasharray="3 5" />
            <text x={left - 12} y={y(value) + 4} textAnchor="end" className={styles.axis}>{formatOreBare(value)}</text>
          </g>;
        })}
        <text x={left - 12} y="10" textAnchor="end" className={styles.axis}>kr</text>
        {dateTicks.map((tick) => <text key={tick} x={x(tick)} y={height - 7} textAnchor={tick === 0 ? "start" : tick === points.length - 1 ? "end" : "middle"} className={styles.axis}>{shortDate(points[tick].day)}</text>)}
        {series.map((line, lineIndex) => {
          const path = line.values.map((value, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(value)}`).join(" ");
          return <g key={line.id}>
            <path d={path} fill="none" stroke={line.color} strokeWidth="2" opacity="0.14" strokeDasharray="4 5" />
            <g clipPath={`url(#${id}-reveal)`}>
              {lineIndex === 0 && <path d={`${path} L${x(points.length - 1)},${y(0)} L${left},${y(0)} Z`} fill={`url(#${id}-${line.id})`} />}
              <path d={path} fill="none" stroke={line.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </g>
            <circle cx={x(index)} cy={y(line.values[index])} r="4.5" fill={line.color} stroke="var(--surface)" strokeWidth="2" className={styles.chartDot} />
          </g>;
        })}
        <line x1={x(cursor)} x2={x(cursor)} y1={top} y2={height - bottom} stroke="var(--ink-faint)" strokeDasharray="4 4" />
        {hover !== null && series.map((line) => <circle key={line.id} cx={x(hover)} cy={y(line.values[hover])} r="5" fill="var(--surface)" stroke={line.color} strokeWidth="2" />)}
      </svg>
    </div>
  );
}

export function StatsDashboard({ season, history }: { season: string; history: StatsHistory }) {
  const { points, members, teams } = history;
  const lastIndex = Math.max(0, points.length - 1);
  const [cursor, setIndex] = useState(lastIndex);
  const index = Math.min(cursor, lastIndex);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"loge" | "members">("loge");
  const [metric, setMetric] = useState<Metric>("chargedOre");
  const [ranking, setRanking] = useState<"members" | "teams">("members");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<number[]>(() => [...members]
    .sort((a, b) => (points[lastIndex]?.members[b.id]?.chargedOre ?? 0) - (points[lastIndex]?.members[a.id]?.chargedOre ?? 0))
    .slice(0, 4).map((member) => member.id));

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((current) => Math.min(lastIndex, current + 1)), Math.max(160, Math.min(850, 16000 / Math.max(1, lastIndex))));
    return () => window.clearInterval(timer);
  }, [playing, lastIndex]);

  // Stop at the end without an effect-triggered render or a lingering timer.
  const isPlaying = playing && index < lastIndex;
  useEffect(() => {
    if (!playing || index < lastIndex) return;
    const timer = window.setTimeout(() => setPlaying(false), 0);
    return () => window.clearTimeout(timer);
  }, [playing, index, lastIndex]);

  const selectDate = (next: number) => { setPlaying(false); setIndex(next); };
  const play = () => {
    if (isPlaying) { setPlaying(false); return; }
    if (index === lastIndex) setIndex(0);
    setPlaying(true);
  };

  if (points.length === 0) return (
    <div className={styles.dashboard}>
      <header className={styles.hero}><span className={styles.eyebrow}>{season} / LOGENS STATS</span><h1 className="display">Følg pengene.<br /><em>Og hinanden.</em></h1><p>Sæsonens historie begynder med den første postering.</p></header>
      <div className={styles.card}><h2 className="display">Klar til start</h2><p className={styles.muted}>Grafer og tidslinje dukker op, så snart der er opkrævninger eller betalinger.</p><Link href="/tabel" className={styles.textLink}>Se logens medlemmer →</Link></div>
    </div>
  );

  const point = points[index];
  const latest = points[lastIndex];
  const currentMembers = members.map((member, i) => ({
    ...member, color: COLORS[i % COLORS.length], ...(point.members[member.id] ?? EMPTY_MEMBER),
  }));
  const rankedMembers = [...currentMembers].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, "da"));
  const rankedTeams = teams.map((team, i) => ({ ...team, color: COLORS[i % COLORS.length], amount: point.teams[team.id] ?? 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "da"));
  const rankRows = ranking === "members"
    ? rankedMembers.map((member) => ({ id: `m${member.id}`, name: member.name, amount: member[metric], color: member.color, href: `/medlem/${member.id}` }))
    : rankedTeams.map((team) => ({ id: `t${team.id}`, name: team.name, amount: team.amount, color: team.color, href: `/hold/${team.id}` }));
  const visibleRanks = rankRows.slice(0, showAll ? rankRows.length : 6);
  const rankMax = Math.max(1, ...rankRows.map((row) => Math.abs(row.amount)));
  const series: Series[] = view === "loge" ? [
    { id: "charged", name: "Opkrævet", color: COLORS[0], values: points.map((p) => p.chargedOre) },
    { id: "paid", name: "Indbetalt", color: COLORS[3], values: points.map((p) => p.paidOre) },
    { id: "pot", name: "I kassen", color: COLORS[2], values: points.map((p) => p.paidOre - p.paidOutOre) },
  ] : members.filter((member) => selected.includes(member.id)).map((member) => ({
    id: `m${member.id}`, name: member.name, color: COLORS[members.indexOf(member) % COLORS.length],
    values: points.map((p) => p.members[member.id]?.[metric] ?? 0),
  }));
  const daily = points.slice(1).map((p, i) => ({ day: p.day, amount: p.chargedOre - points[i].chargedOre, index: i + 1 }));
  const dayMax = Math.max(1, ...daily.map((day) => Math.abs(day.amount)));
  const expensiveDay = [...daily.slice(0, index)].sort((a, b) => b.amount - a.amount)[0];
  const biggestMember = [...currentMembers].sort((a, b) => b.chargedOre - a.chargedOre)[0];
  const coverage = point.chargedOre > 0 ? Math.round(point.paidOre / point.chargedOre * 100) : null;
  const owed = currentMembers.reduce((sum, member) => sum + Math.max(0, member.chargedOre - member.paidOre), 0);
  const credit = currentMembers.reduce((sum, member) => sum + Math.max(0, member.paidOre - member.chargedOre), 0);
  const categories = [
    { name: "Kampopkrævninger", amount: point.matchOre, color: COLORS[0] },
    { name: "Bøder", amount: point.fineOre, color: COLORS[2] },
    { name: "Reguleringer", amount: point.adjustmentOre, color: COLORS[1] },
  ];
  const compositionMax = Math.max(1, ...categories.map((item) => Math.abs(item.amount)));

  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <div className={styles.heroTop}><span className={styles.eyebrow}>{season} / LOGENS STATS</span><span className={styles.seasonBadge}><i /> {members.length} medlemmer · {teams.length} hold</span></div>
        <h1 className="display">Følg pengene.<br /><em>Og hinanden.</em></h1>
        <p>Dyre hold. Tynde undskyldninger. Hele logens økonomi i bevægelse.</p>
        <div className={styles.heroTotals}>
          <div><span>OPKRÆVET</span><strong className="num">{formatOre(point.chargedOre)}</strong><small>Kampe, bøder og reguleringer</small></div>
          <div><span>INDBETALT</span><strong className="num">{formatOre(point.paidOre)}</strong><small>{coverage === null ? "Ingen opkrævninger endnu" : `${coverage}% af det opkrævede`}</small></div>
          <div><span>I FÆLLESKASSEN</span><strong className="num">{formatOre(point.paidOre - point.paidOutOre)}</strong><small>Efter {formatOre(point.paidOutOre)} i udbetalinger</small></div>
        </div>
      </header>

      <section className={styles.timeline} aria-label="Afspil sæsonen">
        <button className={styles.playButton} onClick={play} disabled={lastIndex === 0} aria-label={isPlaying ? "Pause sæsonen" : "Afspil sæsonen"}>
          {isPlaying ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3v10M12 3v10" stroke="currentColor" strokeWidth="3" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>}
        </button>
        <div className={styles.timelineTrack}>
          <div className={styles.timelineLabels}><span>SPOL SÆSONEN</span><output htmlFor="stats-date" className="num">{longDate(point.day)}</output></div>
          <input id="stats-date" type="range" aria-label="Dato i sæsonen" aria-valuetext={longDate(point.day)} min="0" max={lastIndex} value={index} onChange={(event) => selectDate(Number(event.target.value))} />
          <div className={styles.timelineEnds}><span>{shortDate(points[0].day)}</span><span>{shortDate(latest.day)}</span></div>
        </div>
        <button className={styles.latestButton} onClick={() => selectDate(lastIndex)} disabled={index === lastIndex}>Seneste ↗</button>
      </section>

      <section className={styles.card} aria-labelledby="history-title">
        <div className={styles.sectionHeading}><div><span className={styles.kicker}>01 / DET STORE BILLEDE</span><h2 id="history-title" className="display">Det løber op.</h2><p className={styles.muted}>Følg kurverne. Tryk på grafen eller træk i tidslinjen.</p></div>
          <div className={styles.segment} aria-label="Grafvisning">
            <button aria-pressed={view === "loge"} onClick={() => setView("loge")}>Hele logen</button>
            <button aria-pressed={view === "members"} onClick={() => setView("members")}>Sammenlign</button>
          </div>
        </div>
        {view === "members" && <div className={styles.compareControls}>
          <div className={styles.segment} aria-label="Beløb i sammenligning"><button aria-pressed={metric === "chargedOre"} onClick={() => setMetric("chargedOre")}>Opkrævet</button><button aria-pressed={metric === "paidOre"} onClick={() => setMetric("paidOre")}>Indbetalt</button></div>
          <details><summary>Vælg medlemmer <span className="num">{selected.length}/5</span></summary><div className={styles.memberChoices}>
            {members.map((member, i) => <button key={member.id} aria-pressed={selected.includes(member.id)} disabled={!selected.includes(member.id) && selected.length >= 5} style={colorStyle(COLORS[i % COLORS.length])} onClick={() => setSelected((previous) => previous.includes(member.id) ? previous.filter((id) => id !== member.id) : [...previous, member.id])}>{member.name}</button>)}
          </div></details>
        </div>}
        {series.length ? <HistoryChart points={points} series={series} index={index} onSelect={selectDate} /> : <p className={styles.empty}>Vælg mindst ét medlem for at tegne en kurve.</p>}
        <div className={styles.chartFoot}><span><i /> Samlede beløb frem til {shortDate(point.day)}</span><span>{index === lastIndex ? "Seneste postering" : "Du ser et tilbageblik"}</span></div>
      </section>

      <div className={styles.insights}>
        <div><span className={styles.insightIcon} aria-hidden="true">↗</span><div><span className={styles.kicker}>DEN DYRESTE DAG</span><strong>{expensiveDay && expensiveDay.amount > 0 ? formatOre(expensiveDay.amount) : "Ingen endnu"}</strong><small>{expensiveDay && expensiveDay.amount > 0 ? shortDate(expensiveDay.day) : "Der er ro på regningen"}</small></div></div>
        <div><span className={styles.insightIcon} aria-hidden="true">♜</span><div><span className={styles.kicker}>REGNINGENS TOPSCORER</span><strong>{biggestMember && biggestMember.chargedOre > 0 ? biggestMember.name : "Ingen endnu"}</strong><small>{biggestMember && biggestMember.chargedOre > 0 ? `${formatOre(biggestMember.chargedOre)} opkrævet${currentMembers.filter((m) => m.chargedOre === biggestMember.chargedOre).length > 1 ? " · delt førsteplads" : ""}` : "Alle starter på nul"}</small></div></div>
        <div><span className={styles.insightIcon} aria-hidden="true">÷</span><div><span className={styles.kicker}>PR. MEDLEM I SNIT</span><strong>{formatOre(members.length ? Math.round(point.chargedOre / members.length) : 0)}</strong><small>Fordelt på {members.length} medlemmer</small></div></div>
      </div>

      <div className={styles.twoColumns}>
        <section className={styles.card} aria-labelledby="ranking-title">
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>02 / PUNGENS PODIE</span><h2 id="ranking-title" className="display">Hvem tager føringen?</h2></div></div>
          <div className={styles.rankingControls}>
            <div className={styles.segment} aria-label="Rangliste"><button aria-pressed={ranking === "members"} onClick={() => { setRanking("members"); setShowAll(false); }}>Medlemmer</button><button aria-pressed={ranking === "teams"} onClick={() => { setRanking("teams"); setShowAll(false); }}>Hold</button></div>
            {ranking === "members" && <select aria-label="Rangordn medlemmer efter" className={styles.metricSelect} value={metric} onChange={(event) => setMetric(event.target.value as Metric)}><option value="chargedOre">Opkrævet</option><option value="paidOre">Indbetalt</option></select>}
          </div>
          <p className={styles.muted}>{ranking === "teams" ? "Samlet kamppris for alle holdets ejere." : metric === "paidOre" ? "Hvem har lagt flest penge i kassen?" : "Flest kroner på regningen tager førstepladsen."}</p>
          <ol className={styles.race} style={{ height: visibleRanks.length * 49 }} aria-label={`Rangliste den ${longDate(point.day)}`}>
            {visibleRanks.map((row, rank) => <li key={row.id} style={{ ...colorStyle(row.color), transform: `translateY(${rank * 49}px)` }}>
              <span className={styles.rankNumber}>{rank + 1}</span><div className={styles.raceTrack}><div className={styles.raceFill} style={{ width: `${Math.abs(row.amount) / rankMax * 100}%` }} /><Link href={row.href}>{row.name}</Link><span className="num">{formatOre(row.amount)}</span></div>
            </li>)}
          </ol>
          {rankRows.length === 0 && <p className={styles.empty}>Ingen hold fordelt endnu.</p>}
          {rankRows.length > 6 && <button className={styles.textLink} onClick={() => setShowAll(!showAll)}>{showAll ? "Vis top 6 ↑" : `Vis alle ${rankRows.length} ↓`}</button>}
        </section>

        <section className={styles.card} aria-labelledby="daily-title">
          <span className={styles.kicker}>03 / DYRE DAGE</span><h2 id="daily-title" className="display">Av, min pengepung.</h2><p className={styles.muted}>Hver søjle er dagens nye opkrævninger. Tryk på en dag for at spole dertil.</p>
          <div className={styles.dailyReadout}><strong className="num">{formatOre(index > 0 ? daily[index - 1].amount : 0)}</strong><span>{shortDate(point.day)}</span></div>
          <div className={styles.dailyScroll}>
            <div className={styles.dailyBars} style={{ minWidth: Math.max(0, daily.length * 9) }}>
              {daily.map((day) => <button key={day.day} className={`${styles.dayBar} ${day.index === index ? styles.selectedDay : ""}`} style={{ opacity: day.index <= index ? 1 : 0.25 }} onClick={() => selectDate(day.index)} aria-label={`${longDate(day.day)}: ${formatOre(day.amount)} opkrævet`} aria-pressed={day.index === index} title={`${longDate(day.day)} · ${formatOre(day.amount)}`}>
                <span style={{ height: `${Math.max(day.amount === 0 ? 1 : 3, Math.abs(day.amount) / dayMax * 100)}%`, background: day.amount < 0 ? "var(--credit)" : undefined }} />
              </button>)}
            </div>
          </div>
          <div className={styles.dailyDates}><span>{shortDate(daily[0].day)}</span><span>{shortDate(daily[daily.length - 1].day)}</span></div>
          <div className={styles.dailyNote}><span className={styles.kicker}>PÅ DEN VALGTE DAG</span><p>{index === 0 || daily[index - 1].amount === 0 ? "En fredelig dag for pengepungen." : daily[index - 1].amount < 0 ? "Regningen blev lidt lettere." : "Endnu et bidrag til sæsonens regning."}</p></div>
        </section>
      </div>

      <div className={styles.twoColumns}>
        <section className={styles.card} aria-labelledby="payment-title">
          <span className={styles.kicker}>04 / FRA REGNING TIL KASSE</span><h2 id="payment-title" className="display">Er pengene landet?</h2>
          <div className={styles.paymentBody}>
            <div className={styles.donut}>
              <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--rule-soft)" strokeWidth="10" /><circle cx="60" cy="60" r="50" fill="none" stroke="var(--credit)" strokeWidth="10" pathLength="100" strokeDasharray={`${Math.min(100, Math.max(0, coverage ?? 0))} 100`} strokeLinecap="round" transform="rotate(-90 60 60)" /></svg>
              <div><strong className="num">{coverage === null ? "–" : `${coverage}%`}</strong><span>indbetalt</span></div>
            </div>
            <dl><div><dt>Medlemmer skylder</dt><dd className="num">{formatOre(owed)}</dd></div><div><dt>Medlemmer har til gode</dt><dd className="num">{formatOre(credit)}</dd></div><div><dt>Udbetalt fra kassen</dt><dd className="num">{formatOre(point.paidOutOre)}</dd></div></dl>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="composition-title">
          <span className={styles.kicker}>05 / HVOR KOMMER REGNINGEN FRA?</span><h2 id="composition-title" className="display">Holdene eller os selv?</h2>
          <div className={styles.composition}>{categories.map((category) => <div key={category.name} style={colorStyle(category.color)}><div><span>{category.name}</span><b className="num">{formatOre(category.amount)}</b></div><div className={styles.compositionTrack}><span style={{ width: `${Math.abs(category.amount) / compositionMax * 100}%` }} /></div></div>)}</div>
          <p className={styles.muted}>Beløbene inkluderer modposteringer og reguleringer.</p>
        </section>
      </div>

      <details className={`${styles.card} ${styles.details}`}>
        <summary><span className="display">Alle tal på bordet</span><span>Medlemmernes regnskab ↗</span></summary>
        <div className={styles.tableWrap}><table><caption>Samlede beløb i kroner frem til {longDate(point.day)}</caption><thead><tr><th>Medlem</th><th>Opkrævet</th><th>Indbetalt</th><th>Saldo</th></tr></thead><tbody>{[...currentMembers].sort((a, b) => b.chargedOre - a.chargedOre || a.name.localeCompare(b.name, "da")).map((member) => <tr key={member.id}><td><Link href={`/medlem/${member.id}`}>{member.name}</Link></td><td className="num">{formatOreBare(member.chargedOre)}</td><td className="num">{formatOreBare(member.paidOre)}</td><td className="num">{formatOreBare(member.chargedOre - member.paidOre)}</td></tr>)}</tbody></table></div>
      </details>
      <p className={styles.methodNote}>Tidslinjen følger kamp- og posteringsdatoer i dansk tid. Opkrævningsmåneden kan være en anden. Alle grafer viser registrerede beløb i {season}, også fra tidligere medlemmer. Holdenes priser tæller alle ejere med.</p>
    </div>
  );
}
