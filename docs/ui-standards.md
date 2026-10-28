# UI conventions

Use the palette from design-system.css, the type scale from typography.css, and shared dimensions/spacing from layout.css. Role-specific layouts remain in App.css.

Use ui/Button for native buttons and ui/Field for labels. Preserve handlers, native type, refs, disabled and ARIA attributes. Required markers and validation stay within the label. Reuse Dialog, ValidatedForm, Alert, Toast, EmptyState and Evidence components. Grid forms own their gaps; avoid adding label margins to grid gaps.

Spacing: 4/8/12/16/24px. Panel padding: 16px desktop, 14px mobile. Controls: 40px desktop, at least 44px mobile. Input text: 16px mobile. Body: 14px; captions: 12px; section titles: 18px; page titles: 24px.

Check 360px and 390px widths, long Thai text, wrapped actions, disabled/error/loading/empty states and keyboard focus. Use local fixtures for visual checks rather than creating production transactions.

Verification: 37 existing behavioral tests passed; lint and build passed. Local browser checks covered management list/detail, user editor/confirmation, public assignment form, Messenger jobs/stops/evidence/history/account. Checked mobile form and Messenger views had no document horizontal overflow. Temporary fixtures were removed. Production asset hashes matched the build. Browser control timed out during the final live visual check, so no new live screenshot was captured.
