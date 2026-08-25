export function calculateFinancialHealth({
  forecast,
  monthlyIncomeCents,
  debtMinimumPaymentsCents = 0,
  emergencyReserveCents = 0,
  monthsOfHistory = 0,
}) {
  const safeIncome = Math.max(1, monthlyIncomeCents);
  const debtRatio = debtMinimumPaymentsCents / safeIncome;
  const reserveMonths = emergencyReserveCents / safeIncome;

  let score = 100;
  if (forecast.status === 'critical') score -= 35;
  else if (forecast.status === 'warning') score -= 18;

  score -= Math.min(30, Math.round(debtRatio * 60));
  if (reserveMonths < 1) score -= 18;
  else if (reserveMonths < 3) score -= 8;
  if (monthsOfHistory < 1) score -= 8;
  else if (monthsOfHistory < 3) score -= 3;

  const normalized = Math.max(0, Math.min(100, score));
  return {
    score: normalized,
    level: normalized >= 80 ? 'strong' : normalized >= 60 ? 'attention' : 'fragile',
    debtToIncomeRatio: debtRatio,
    reserveMonths,
    methodologyVersion: '1.0.0',
    disclaimer: 'Indicador educativo. Não é análise de crédito nem recomendação financeira.',
  };
}
