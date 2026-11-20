"use client";

import { ASSET_TYPE_INFO, FUND_EXPLAIN, GOLD_KINDS, GOLD_SYMBOL, type AssetType } from "@/lib/assets";
import { Field, inputCls } from "./ui";

/**
 * Formlardaki sembol alanı: altında altın türü seçimi (gram, çeyrek, yarım…),
 * fonda TEFAS kodu (kısa açıklamayla), diğerlerinde serbest sembol.
 */
export function SymbolField({
  assetType,
  value,
  onChange,
  disabled,
  label = "Sembol",
  showHint = true,
}: {
  assetType: AssetType;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
  showHint?: boolean;
}) {
  if (assetType === "gold") {
    const v = GOLD_KINDS.some((k) => k.symbol === value) ? value : GOLD_SYMBOL;
    return (
      <Field label="Altın türü" hint={showHint ? "Çeyrek, yarım, tam, cumhuriyet ve ata adetle; gram ve bilezik gramla girilir." : undefined}>
        <select className={inputCls} value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {GOLD_KINDS.map((k) => (
            <option key={k.symbol} value={k.symbol}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field label={assetType === "fund" ? "Fon kodu" : label} hint={showHint ? (assetType === "fund" ? `${ASSET_TYPE_INFO.fund.symbolHint}. ${FUND_EXPLAIN}` : ASSET_TYPE_INFO[assetType].symbolHint) : undefined}>
      <input
        className={`${inputCls} uppercase`}
        value={value}
        disabled={disabled}
        required
        placeholder={showHint ? undefined : ASSET_TYPE_INFO[assetType].symbolHint}
        maxLength={assetType === "fund" ? 3 : undefined}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** Varlık türü değişince sembolün başlangıç değeri */
export function symbolOnTypeChange(next: AssetType, prev: AssetType, current: string): string {
  if (next === "gold") return GOLD_SYMBOL;
  if (prev === "gold" || prev === "fund" || next === "fund") return "";
  return current;
}
