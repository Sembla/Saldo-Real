import { AppError } from './errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function requiredText(value, field, { min = 1, max = 120 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw new AppError(`${field} deve ter entre ${min} e ${max} caracteres.`, 422, 'VALIDATION_ERROR');
  }
  return text;
}

export function optionalText(value, field, max = 500) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, field, { min: 1, max });
}

export function email(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw new AppError('Informe um e-mail válido.', 422, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function password(value) {
  const text = String(value ?? '');
  if (text.length < 10 || text.length > 128 || !/[A-Za-z]/.test(text) || !/\d/.test(text)) {
    throw new AppError('A senha precisa ter 10 a 128 caracteres, com letras e números.', 422, 'VALIDATION_ERROR');
  }
  return text;
}

export function isoDate(value, field = 'data') {
  const text = String(value ?? '');
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!ISO_DATE_PATTERN.test(text) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) {
    throw new AppError(`${field} deve estar no formato AAAA-MM-DD.`, 422, 'VALIDATION_ERROR');
  }
  return text;
}

export function integer(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new AppError(`${field} deve ser um número inteiro entre ${min} e ${max}.`, 422, 'VALIDATION_ERROR');
  }
  return number;
}

export function numberValue(value, field, { min = -Infinity, max = Infinity } = {}) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new AppError(`${field} deve ser um número entre ${min} e ${max}.`, 422, 'VALIDATION_ERROR');
  }
  return number;
}

export function oneOf(value, field, values) {
  if (!values.includes(value)) {
    throw new AppError(`${field} deve ser um de: ${values.join(', ')}.`, 422, 'VALIDATION_ERROR');
  }
  return value;
}

export function currency(value = 'BRL') {
  const normalized = String(value).toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new AppError('Moeda deve usar o código ISO 4217.', 422, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function country(value = 'BR') {
  const normalized = String(value).toUpperCase();
  if (!COUNTRY_PATTERN.test(normalized)) {
    throw new AppError('País deve usar o código ISO 3166-1 alfa-2.', 422, 'VALIDATION_ERROR');
  }
  return normalized;
}

export function booleanValue(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new AppError('Valor booleano inválido.', 422, 'VALIDATION_ERROR');
  }
  return value;
}
