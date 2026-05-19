/**
 * Jira inbound webhook handler.
 *
 * Receives webhook events from Jira and extracts status changes.
 * Auth: shared secret in `?token=<secret>` query param. Jira Cloud's REST-registered
 * webhooks (OAuth) don't sign payloads with HMAC, so we authenticate via URL token.
 * Status field: `changelog.items[]` where `field === 'status'` → `toString`.
 */

import { timingSafeEqual } from 'crypto'
import type { InboundWebhookHandler, InboundWebhookResult } from '../inbound-types'

export const jiraInboundHandler: InboundWebhookHandler = {
  async verifySignature(request: Request, _body: string, secret: string): Promise<true | Response> {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) {
      return new Response('Missing token', { status: 401 })
    }

    const tokenBuf = Buffer.from(token)
    const secretBuf = Buffer.from(secret)
    const valid = tokenBuf.length === secretBuf.length && timingSafeEqual(tokenBuf, secretBuf)

    if (!valid) {
      return new Response('Invalid token', { status: 401 })
    }

    return true
  },

  async parseStatusChange(body: string): Promise<InboundWebhookResult | null> {
    const payload = JSON.parse(body)

    // Jira sends `jira:issue_updated` for issue changes
    if (
      !payload.webhookEvent?.includes('issue_updated') &&
      payload.webhookEvent !== 'jira:issue_updated'
    ) {
      return null
    }

    // Look for a status change in the changelog
    const statusChange = payload.changelog?.items?.find(
      (item: { field: string }) => item.field === 'status'
    )
    if (!statusChange) return null

    const issueKey = payload.issue?.key
    if (!issueKey) return null

    return {
      externalId: issueKey,
      externalStatus: statusChange.toString,
      eventType: 'jira:issue_updated',
    }
  },
}
