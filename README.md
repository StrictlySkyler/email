# harbormaster-email

A harbor for sending an email automatically.

[[screenshot.png]]

Shipping to this harbor will send an email with the preconfigured settings, as depicted in the screenshot.

Dynamic values can also be inserted in the Subject and Body fields, parsed from the manifest passed to the harbor at runtime.  To insert a value from the harbor's shipment, use double-brackets, e.g.: `[[timestamp]]`.  To insert an un-parsed JSON value as a string, use triple-brackets, e.g.: `[[[prior_manifest]]]`

Any value on the Shipment object can be referenced in this way, and will be converted to a string.
