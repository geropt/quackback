/**
 * Auto-changelog: when a post transitions to a status in the `complete` category
 * (typically driven by an external issue tracker marking the linked ticket as Done),
 * create a draft changelog entry linked to that post.
 *
 * The admin reviews the draft and publishes it manually — we never auto-publish.
 */

import { db, changelogEntryPosts, posts, eq } from '@/lib/server/db'
import type { StatusCategory } from '@/lib/server/db'
import type { PostId, PrincipalId } from '@quackback/ids'
import { createChangelog } from './changelog.service'

export async function maybeCreateDraftChangelogForPost(
  postId: PostId,
  newStatusCategory: StatusCategory,
  actor: { principalId: PrincipalId; displayName?: string }
): Promise<void> {
  if (newStatusCategory !== 'complete') return

  const existing = await db.query.changelogEntryPosts.findFirst({
    where: eq(changelogEntryPosts.postId, postId),
  })
  if (existing) return

  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) })
  if (!post) return

  await createChangelog(
    {
      title: post.title,
      content: `Resolved: ${post.title}`,
      publishState: { type: 'draft' },
      linkedPostIds: [postId],
    },
    { principalId: actor.principalId, name: actor.displayName ?? 'Integration' }
  )
}
