## Update Sandeep's directory email

Update the email shown in the employee directory for **Sandeep Kumar Mandal** from `sandeep@colladome.in` to `sandeep.suman@colladome.in`.

### Change
- One row update on `public.profiles` where `id = 38290b50-49a9-4af3-9f3f-a052497d63cb`, setting `email = 'sandeep.suman@colladome.in'`.

### Caveat (please confirm)
The `profiles.email` is his **login email** (the Google account he signs in with). Changing it here updates what the directory displays, but his actual Google SSO login remains `sandeep@colladome.in` — I cannot change the auth account itself. If he needs to sign in with the new address, he must sign in once with `sandeep.suman@colladome.in` (Google) and HR re-links the profile.

Proceed with just the directory display update?
