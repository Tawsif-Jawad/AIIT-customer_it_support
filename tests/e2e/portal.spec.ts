import { test, expect } from '@playwright/test';

test.describe('Enterprise IT Support Portal Browser Workflows', () => {
  test('Employee uses development sign-in, submits a ticket, and views mock AI guidance', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('h1')).toContainText('AIIT');

    // Authenticate as Employee Tawsif Zawad
    await page.fill('#login-email-input', 'tawsif.zawad@upstra.com');
    await page.click('#login-submit-btn');

    await expect(page.getByTestId('active-user-badge')).toContainText('Tawsif Zawad');

    // Submit a new Outlook configuration ticket
    await page.click('button[data-tab="create"]');
    await page.selectOption('#ticket-category', { label: 'Outlook & Mail Client Configuration (AI Auto-Triage Eligible)' });
    await page.fill('#ticket-title', 'Outlook STARTTLS setup prompt on macOS');
    await page.fill('#ticket-description', 'Please provide steps to configure IMAP 993 and SMTP 587 STARTTLS.');
    await page.click('#submit-ticket-btn');

    await expect(page.getByTestId('detail-ticket-status')).toContainText('RESOLVED_PENDING_CONFIRMATION');
    await expect(page.getByTestId('ai-decision-box')).toContainText('LOW_RISK_OUTLOOK_CONFIGURATION');
  });
});
