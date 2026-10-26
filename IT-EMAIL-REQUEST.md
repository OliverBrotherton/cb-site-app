# Request to IT: let the Site App send snag emails from Microsoft 365

Hi,

I've set up a site app for snagging (https://cb-site-app.vercel.app). It needs to send emails to contractors from a company mailbox. It uses Microsoft Graph with an app registration, so there's no mailbox password and no SMTP AUTH. Could you please:

1. **Create a shared mailbox** `snags@chasberger.co.uk`, display name "Chas Berger Snags". It doesn't need a licence.

2. **Register an app** in Entra ID (portal.azure.com > Microsoft Entra ID > App registrations > New registration):
   - Name: `CB Site App`
   - Supported account types: this organisation only
   - No redirect URI

3. **Give it permission to send mail:** API permissions > Add a permission > Microsoft Graph > **Application permissions** > `Mail.Send`, then **Grant admin consent**.

4. **Limit it to the snags mailbox only**, so the app can't send as anyone else. Use an Exchange Application Access Policy (or RBAC for Applications) scoped to snags@chasberger.co.uk. For example:
   ```
   New-DistributionGroup -Name "CB Site App senders" -Type Security -Members snags@chasberger.co.uk
   New-ApplicationAccessPolicy -AppId <Application (client) ID> -PolicyScopeGroupId "CB Site App senders" -AccessRight RestrictAccess -Description "Site App can only send as snags@"
   ```

5. **Create a client secret:** Certificates & secrets > New client secret, expiry 24 months. Please put a reminder in for renewal.

Then please send me these three values. The secret is best sent by Teams or by phone, not email:
- **Directory (tenant) ID**
- **Application (client) ID**
- **Client secret value**

The app only sends: snag details and photos to the contractor, a copy to the PM, and a note to the PM when a contractor closes a snag out. It doesn't read any mailbox.

Thanks
