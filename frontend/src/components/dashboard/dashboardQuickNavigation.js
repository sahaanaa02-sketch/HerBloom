export function runDashboardQuickAction(action, navigate, quickLog) {
  switch (action) {
    case 'scan':
      return navigate?.('nutrition', { openScanner: true })
    case 'water':
      return quickLog('water')
    case 'breathing':
      return navigate?.('wellbeing', { openBreathing: true })
    case 'ask':
      return navigate?.('chat')
  }
}
