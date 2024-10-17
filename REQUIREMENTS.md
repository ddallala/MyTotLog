# MyTotLog Requirements

## User requirements

1. User should be able to add a new activity:
    * Supported activities are: Feeds, Wets and Solids
    * All Activities include a Date and Time, and Notes
    * Feeds also include an amount in ML
2. User can add an activity using VOICE
3. User should be able to see a timeline of activities ordered by most recent
4. User can see the time difference since the previous activity for each activity
5. User can see an updated time since last feed
6. User should be able to edit and delete activities
7. User does not need to login (each new visit creates a brand new session)
8. User can invite other caregiver to session (no need to log in)
9. User can see KPIs for the day and for the last 24 hrs - total amount fed, total number of feedings, amount per feeding.
10. User can add baby information such as name, data of birth and weight to improve the insights
11. User can view a trend chart of feeding amounts and feeding numbers
12. User gets insights on the next feeding time and other useful information (powered by LLMs)
13. User can chose LLM model provider
14. User can change the “insights” that the LLM provides by updating the prompt
15. User can customize the LLM’s instructions to add other behaviors, knowledge or things to focus on
16. User can chat with an AI caregiver LLM and ask more questions

## Tech requirements
1. App should works as a PWA, and be mobile optimized
2. Database to store sessions, activities, baby info, settings and chats should be in Firestore
3. LLM insights and chat should support latest OpenAI, Anthropic, Google models
4. Should use Langchain to abstract LLM logic
5. Use Langsmith to log all LLM calls
