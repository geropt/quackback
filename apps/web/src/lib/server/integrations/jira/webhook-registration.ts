/**
 * Jira webhook registration.
 *
 * Uses Jira REST API to create/delete webhooks for issue status sync.
 * Note: Jira Cloud webhooks expire after 30 days by default.
 */

interface JiraWebhookResult {
  webhookId: string
}

/**
 * Register a webhook with Jira to receive issue update events.
 */
export async function registerJiraWebhook(
  accessToken: string,
  cloudId: string,
  callbackUrl: string,
  secret: string,
  projectKey: string
): Promise<JiraWebhookResult> {
  // Jira Cloud REST-registered webhooks don't support HMAC payload signing for OAuth apps,
  // so we authenticate inbound requests via a shared secret in the URL query string.
  const url = new URL(callbackUrl)
  url.searchParams.set('token', secret)
  const authenticatedCallbackUrl = url.toString()

  // Jira allows only one REST-registered webhook URL per OAuth app/user. If a previous
  // registration is still around (e.g. an earlier disable failed to clean up, or the URL
  // changed), POST returns "Only a single URL per user is allowed". Sweep first.
  await deleteAllJiraWebhooksForApp(accessToken, cloudId)

  const response = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: authenticatedCallbackUrl,
      webhooks: [
        {
          jqlFilter: `project = "${projectKey}"`,
          events: ['jira:issue_updated'],
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Jira API error ${response.status}: ${body}`)
  }

  const result = (await response.json()) as {
    webhookRegistrationResult?: Array<{ createdWebhookId?: number; errors?: string[] }>
  }
  const first = result.webhookRegistrationResult?.[0]
  const webhookId = first?.createdWebhookId
  if (!webhookId) {
    const detail = first?.errors?.join('; ') ?? JSON.stringify(result)
    throw new Error(`Jira webhook registration failed: ${detail}`)
  }

  return { webhookId: String(webhookId) }
}

/**
 * Delete a webhook from Jira.
 */
export async function deleteJiraWebhook(
  accessToken: string,
  cloudId: string,
  webhookId: string
): Promise<void> {
  await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ webhookIds: [Number(webhookId)] }),
  })
}

/**
 * List then delete every REST-registered webhook owned by this OAuth app.
 * Called from registerJiraWebhook to recover from leftover registrations.
 * Best-effort: errors are logged and swallowed so the caller can still attempt POST.
 */
async function deleteAllJiraWebhooksForApp(accessToken: string, cloudId: string): Promise<void> {
  try {
    const listRes = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!listRes.ok) return

    const list = (await listRes.json()) as { values?: Array<{ id?: number }> }
    const ids = (list.values ?? [])
      .map((w) => w.id)
      .filter((id): id is number => typeof id === 'number')
    if (ids.length === 0) return

    await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ webhookIds: ids }),
    })
  } catch (err) {
    console.warn('[Jira] Failed to sweep existing webhooks:', err)
  }
}
