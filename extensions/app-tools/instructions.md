## When to Use FAQ Tools

Use these tools when the merchant asks about:

- Viewing or listing FAQ entries
- Looking up a specific FAQ's question, answer, or visibility

## Important Guidelines

- Use `list_faqs` first to find an FAQ's ID before calling `get_faq`
- The `show_on_faq_page` field indicates whether an FAQ is publicly visible

## Common Workflows

### Listing All FAQs

1. Call `list_faqs` to retrieve all FAQ entries with their IDs and content

### Looking Up a Specific FAQ

1. Call `list_faqs` to find the relevant entry by question
2. Call `get_faq` with the entry's ID to retrieve full details
