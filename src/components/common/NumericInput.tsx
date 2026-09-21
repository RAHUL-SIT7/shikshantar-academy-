import React from 'react';

export interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (numericValue: number, stringValue: string) => void;
  allowDecimals?: boolean;
  maxAmount?: number;
  minAmount?: number;
}

/**
 * Strict Numeric / Currency Input Component for Shikshantar Fee Management System.
 * - Rejects any keystrokes that are not digits 0-9 (blocks letters, -, +, e, spaces, decimal points by default).
 * - Sanitizes pasted text strictly to digits-only.
 * - Prevents unwanted leading zeros beyond single '0' (e.g. '04000' -> '4000').
 * - Integrates seamlessly with integer-safe arithmetic.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(({
  value,
  onChange,
  onValueChange,
  allowDecimals = false,
  maxAmount,
  minAmount = 0,
  className = '',
  onKeyDown,
  onPaste,
  ...restProps
}, ref) => {
  const sanitize = (raw: string | number | undefined | null): string => {
    if (raw === undefined || raw === null) return '';
    let str = String(raw);
    if (allowDecimals) {
      // Keep only digits and at most one decimal point
      str = str.replace(/[^0-9.]/g, '');
      const parts = str.split('.');
      if (parts.length > 2) {
        str = parts[0] + '.' + parts.slice(1).join('');
      }
    } else {
      str = str.replace(/[^0-9]/g, '');
    }

    // Strip leading zeros unless it's just '0'
    if (!allowDecimals && str.length > 1 && str.startsWith('0')) {
      str = str.replace(/^0+/, '');
      if (str === '') str = '0';
    }
    return str;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation & standard control keys
    if (
      ['Backspace', 'Tab', 'Enter', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key) ||
      (e.ctrlKey || e.metaKey)
    ) {
      if (onKeyDown) onKeyDown(e);
      return;
    }

    // Allow decimal point only if explicitly configured
    if (allowDecimals && e.key === '.') {
      const currentVal = String(value || '');
      if (currentVal.includes('.')) {
        e.preventDefault();
        return;
      }
      if (onKeyDown) onKeyDown(e);
      return;
    }

    // Block everything that is not a digit 0-9
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      return;
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    const sanitized = sanitize(pastedText);
    
    // Trigger synthetic or direct update
    const target = e.currentTarget;
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const currentValue = String(value || '');
    const nextValue = sanitize(currentValue.slice(0, start) + sanitized + currentValue.slice(end));
    
    const num = nextValue === '' ? 0 : (allowDecimals ? parseFloat(nextValue) : parseInt(nextValue, 10));
    if (onValueChange) {
      onValueChange(isNaN(num) ? 0 : num, nextValue);
    }

    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: { ...target, value: nextValue },
        currentTarget: { ...target, value: nextValue }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
    }

    if (onPaste) {
      onPaste(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const sanitized = sanitize(raw);
    const num = sanitized === '' ? 0 : (allowDecimals ? parseFloat(sanitized) : parseInt(sanitized, 10));

    if (onValueChange) {
      onValueChange(isNaN(num) ? 0 : num, sanitized);
    }

    if (onChange) {
      // Pass clean sanitized value in the event
      e.target.value = sanitized;
      onChange(e);
    }
  };

  const displayValue = value === undefined || value === null ? '' : String(value);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={displayValue}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={handleChange}
      className={className}
      {...restProps}
    />
  );
});

NumericInput.displayName = 'NumericInput';

export default NumericInput;
