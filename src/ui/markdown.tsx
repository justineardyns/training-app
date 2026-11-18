import type { ComponentChildren } from 'preact';

// Veilige mini-markdown voor de rapporten van /coach: koppen, lijsten, citaten, vet/cursief, links.
// Geen innerHTML: alles wordt als tekst opgebouwd.

function inline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k++}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={k++}>{m[4]}</code>);
    else if (m[5] && m[6])
      out.push(
        <a key={k++} href={m[6]} target="_blank" rel="noopener">
          {m[5]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown(props: { text: string }) {
  const blocks: ComponentChildren[] = [];
  const lines = props.text.replace(/\r/g, '').split('\n');
  let list: string[] = [];
  let ordered = false;
  let para: string[] = [];
  let k = 0;
  const flush = () => {
    if (para.length) blocks.push(<p key={k++}>{inline(para.join(' '))}</p>);
    para = [];
    if (list.length) {
      const items = list.map((l, i) => <li key={i}>{inline(l)}</li>);
      blocks.push(ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>);
    }
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) flush();
    else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush();
      const level = m[1]!.length;
      const content = inline(m[2]!);
      blocks.push(level <= 1 ? <h2 key={k++}>{content}</h2> : level === 2 ? <h3 key={k++}>{content}</h3> : <h4 key={k++}>{content}</h4>);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      blocks.push(<blockquote key={k++}>{inline(m[1]!)}</blockquote>);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (para.length || (list.length && ordered)) flush();
      ordered = false;
      list.push(m[1]!);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (para.length || (list.length && !ordered)) flush();
      ordered = true;
      list.push(m[1]!);
    } else {
      if (list.length) flush();
      para.push(line.trim());
    }
  }
  flush();
  return <div class="md">{blocks}</div>;
}
