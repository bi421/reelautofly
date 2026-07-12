// apps/publisher/src/alerts.ts
export type AlertLevel = 'info' | 'warning' | 'critical'

export type AlertPayload = {
  level: AlertLevel
  title: string
  jobId: string
  detail: string
}

// TODO: fb-planner-audit-д байгаа TELEGRAM_BOT_TOKEN / TELEGRAM_USER_ID
// pattern-ыг энд холбоно. Одоохондоо зөвхөн log хийж, юу ч чимээгүй алга болохгүй.
export async function alertOps(payload: AlertPayload): Promise<void> {
  const prefix = payload.level === 'critical' ? '🔴' : payload.level === 'warning' ? '🟡' : '🔵'
  console.log(
    `${prefix} [ALERT:${payload.level.toUpperCase()}] ${payload.title} (job=${payload.jobId})\n  ${payload.detail}`,
  )

  // Дараа нь идэвхжүүлэх:
  // await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     chat_id: process.env.TELEGRAM_USER_ID,
  //     text: `${prefix} ${payload.title}\nJob: ${payload.jobId}\n${payload.detail}`,
  //   }),
  // })
}