import { describe, it, expect } from 'vitest'
import { matchWebhook, extractInputFromPayload } from './index'

describe('matchWebhook', () => {
  const payload = {
    headers: { 'x-gitlab-event': 'Merge Request Hook', 'content-type': 'application/json' },
    body: { action: 'open', object_attributes: { url: 'https://gitlab.com/mr/1', title: 'Fix bug' } },
  }

  it('matches when all rules pass', () => {
    const rules = { 'headers.x-gitlab-event': 'Merge Request Hook', 'body.action': 'open' }
    expect(matchWebhook(rules, payload)).toBe(true)
  })

  it('fails when a rule does not match', () => {
    const rules = { 'headers.x-gitlab-event': 'Push Hook' }
    expect(matchWebhook(rules, payload)).toBe(false)
  })

  it('matches nested body fields', () => {
    const rules = { 'body.object_attributes.title': 'Fix bug' }
    expect(matchWebhook(rules, payload)).toBe(true)
  })

  it('matches empty rules (always true)', () => {
    expect(matchWebhook({}, payload)).toBe(true)
  })
})

describe('extractInputFromPayload', () => {
  const payload = {
    headers: { 'x-event': 'push' },
    body: { ref: 'refs/heads/main', commits: [{ id: 'abc' }] },
  }

  it('extracts values by path', () => {
    const rules = { REF: 'body.ref', EVENT: 'headers.x-event' }
    const result = extractInputFromPayload(rules, payload)
    expect(result).toEqual({ REF: 'refs/heads/main', EVENT: 'push' })
  })

  it('skips undefined paths', () => {
    const rules = { MISSING: 'body.nonexistent.deep' }
    const result = extractInputFromPayload(rules, payload)
    expect(result).toEqual({})
  })
})
