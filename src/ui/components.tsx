import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function Sheet(props: { open: boolean; onClose: () => void; title?: string; children: ComponentChildren }) {
  if (!props.open) return null;
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grip" />
        {props.title && <h2 class="sheet-title">{props.title}</h2>}
        {props.children}
        <button class="btn ghost" onClick={props.onClose}>
          Sluiten
        </button>
      </div>
    </div>
  );
}

/** Draaiwiel: enkel geldige gewichten, grote rijen, huidige waarde in het midden. */
export function WeightWheel(props: {
  open: boolean;
  options: number[];
  value: number;
  format: (kg: number) => string;
  detail?: (kg: number) => string | undefined;
  onPick: (kg: number) => void;
  onClose: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const el = list.current?.querySelector<HTMLElement>('[data-current="true"]');
    el?.scrollIntoView({ block: 'center' });
  }, [props.open]);
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Kies je gewicht">
      <div class="wheel" ref={list}>
        {props.options.map((kg) => (
          <button
            key={kg}
            class={`wheel-row ${kg === props.value ? 'on' : ''}`}
            data-current={kg === props.value}
            onClick={() => {
              props.onPick(kg);
              props.onClose();
            }}
          >
            <span>{props.format(kg)}</span>
            {props.detail?.(kg) && <span class="muted small">{props.detail(kg)}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function Stepper(props: { value: number; onChange: (delta: number) => void; label?: string; suffix?: string }) {
  return (
    <div class="stepper" aria-label={props.label}>
      <button class="step-btn" aria-label="min" onClick={() => props.onChange(-1)}>
        −
      </button>
      <span class="step-val">
        {props.value}
        {props.suffix && <span class="muted small"> {props.suffix}</span>}
      </span>
      <button class="step-btn" aria-label="plus" onClick={() => props.onChange(1)}>
        +
      </button>
    </div>
  );
}

export function Chips<T extends string | number>(props: {
  options: { value: T; label: string; tone?: 'orange' | 'red' }[];
  value: T | T[] | undefined;
  onChange: (v: T) => void;
  wrap?: boolean;
  label?: string;
}) {
  const isOn = (v: T) => (Array.isArray(props.value) ? props.value.includes(v) : props.value === v);
  return (
    <div class={`chips ${props.wrap ? 'wrap' : ''}`} role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          class={`chip ${isOn(o.value) ? `on ${o.tone ?? ''}` : ''}`}
          aria-pressed={isOn(o.value)}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill(props: { tone?: 'green' | 'orange' | 'red'; children: ComponentChildren }) {
  return <span class={`pill ${props.tone ?? ''}`}>{props.children}</span>;
}

export function Messages(props: { messages: string[] }) {
  if (!props.messages.length) return null;
  return (
    <div class="card coach">
      {props.messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}
