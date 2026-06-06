# Trust Library MVP Build Checklist

## Access Needed

- GitHub repo access
- Vercel project access
- Supabase project access
- OpenAI API key
- Later: Meta developer app access for Instagram/Facebook import

Do not paste secrets into chat. Add them as environment variables in Vercel and Supabase where needed.

## First Production Loop

1. User logs in.
2. User adds a video manually or by URL.
3. App stores title, source, thumbnail, transcript, summary, tags, and suggested use.
4. User searches the library by concern, service, objection, proof type, or topic.
5. Sales rep creates a prospect brief.
6. App recommends a trust journey.
7. Rep reviews and shares a private journey link.
8. Prospect watches the sequence.

## Core User Workflows

### Library Manager

- Connect/import content sources.
- Review new imports.
- Approve transcripts and summaries.
- Fix tags, topics, proof type, and recommended use.
- Maintain the searchable library.

### Sales Rep

- Create prospect brief.
- Add service, stage, notes, objections, and goal.
- Review recommended sequence.
- Edit/order videos.
- Share private link.
- See watch activity.

### Owner

- See top trust assets.
- See content gaps.
- See team usage.
- Decide what videos should be created next.

### Prospect

- Open private journey link.
- Watch ordered videos.
- Read summaries/transcripts if needed.
- Take next step.

## Build Order

1. Convert prototype to Next.js routes.
2. Add Supabase auth.
3. Add workspace/profile records.
4. Add videos table and manual add form.
5. Add video detail/edit screen.
6. Add OpenAI summary/tag endpoint.
7. Add search.
8. Add prospect brief workflow.
9. Add journey builder.
10. Add public share page.
11. Add activity tracking.
12. Add Meta integration.
