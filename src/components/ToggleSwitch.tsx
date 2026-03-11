import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onColor: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  onColor,
}: ToggleSwitchProps) {
  const styleVars = {
    ['--ts-on-color' as never]: onColor,
  } as React.CSSProperties;

  return (
    <label
      className={`toggleSwitch ${checked ? 'isChecked' : ''}`}
      style={styleVars}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        role="switch"
        aria-checked={checked}
        className="toggleSwitch__input"
      />
      <span
        aria-hidden="true"
        className="toggleSwitch__track"
      >
        <span className="toggleSwitch__knob" />
      </span>
      <span className="toggleSwitch__label">{label}</span>
    </label>
  );
}
