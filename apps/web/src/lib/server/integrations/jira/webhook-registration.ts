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
