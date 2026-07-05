import { test, expect, type Page } from '@playwright/test'

// Smoke tests against the Phokus UI Lab (docs/ui-lab.md) — a browser-only dev
// mode that runs the real App.tsx/store/components against seeded, in-memory
// mock fixtures selected via the `?scenario=` query param.

const browserErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  browserErrors.set(page, errors)

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
})

test.describe('gallery scenarios', () => {
  test('rich scenario renders the gallery grid with folders in the sidebar', async ({ page }) => {
    await page.goto('/?scenario=rich')

    await expect(page.getByText('Camera Roll', { exact: true })).toBeVisible()
    await expect(page.getByText('Client Selects', { exact: true })).toBeVisible()
    await expect(page.getByText('Video Archive', { exact: true })).toBeVisible()

    await expect(page.getByRole('button', { name: /^Open / }).first()).toBeVisible()
  })

  test('filename search filters the visible gallery results', async ({ page }) => {
    await page.goto('/?scenario=rich')

    const search = page.getByPlaceholder('Search files, or use /s /t')
    await search.fill('coastal-walk-003')

    await expect(page.getByText('Filename')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open coastal-walk-003.jpg' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(1)
  })

  test('empty scenario shows the empty library without the onboarding tour', async ({ page }) => {
    await page.goto('/?scenario=empty')

    await expect(page.getByText('No media found')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Welcome' })).not.toBeVisible()
  })

  test('new-user scenario opens the onboarding tour on step 1', async ({ page }) => {
    await page.goto('/?scenario=new-user')

    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible()
    await expect(page.getByText('Step 1 of 8')).toBeVisible()
  })

  test('duplicates fixture data shows cached groups in Duplicate Finder', async ({ page }) => {
    await page.goto('/?scenario=duplicates')

    await page.getByText('Duplicates', { exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Duplicate Finder' })).toBeVisible()
    await expect(page.getByText(/\d+ groups? · .* reclaimable/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Select all duplicates' })).toBeVisible()
  })
})

test.describe("what's new", () => {
  test('just-updated scenario shows the toast and opens the modal on click', async ({ page }) => {
    await page.goto('/?scenario=just-updated')

    const toastButton = page.getByRole('button', { name: "What's new" })
    await expect(toastButton).toBeVisible()
    await toastButton.click()

    await expect(page.getByRole('heading', { name: /^Phokus v/ })).toBeVisible()
  })

  test('just-updated + unreleased changelog opens the modal with the section nav rail', async ({
    page,
  }) => {
    await page.goto('/?scenario=just-updated&changelog=unreleased')

    await page.getByRole('button', { name: "What's new" }).click()

    await expect(page.getByRole('heading', { name: /^Phokus v/ })).toBeVisible()
    const sectionRail = page.getByRole('navigation')
    await expect(sectionRail.getByRole('button', { name: /Added/ })).toBeVisible()
    await expect(sectionRail.getByRole('button', { name: /Changed/ })).toBeVisible()
  })
})
