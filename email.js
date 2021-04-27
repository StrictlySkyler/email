/* eslint no-param-reassign: 0,
  function-paren-newline: 0,
  import/no-unresolved: 0,
  no-underscore-dangle: 0 */
/* globals $H */

const name = 'email';

const dependencies = [
  'email-validator',
  'js-htmlencode',
  'debug',
  'lodash',
].join(' ');

require('child_process').execSync(`npm i ${dependencies}`);

const log = require('debug')(`${name}:log`);
const error = require('debug')(`${name}:error`);

const _ = require('lodash');
const encode = require('js-htmlencode').htmlEncode;

log(`Dependencies installed: ${dependencies}`);

let Shipments;

const renderInput = (values) => {
  values = values || {};

  return /*html*/`
    <style>
      .harbor textarea.email-list {
        resize: vertical;
        min-height: initial;
      }

      .harbor textarea.email-raw-text {
        min-height: 150px;
      }
    </style>
    <p>Note: Duplicates email addresses aren't allowed within individual recipient types (To, CC, BCC).</p>
    <label>From:
      <span class="address-field">
        <input
          type=email
          name=fromEmail
          class="from-email"
          placeholder="harbormaster@localhost"
          required
          value="${values.fromEmail || ''}"
        >
      </span>
    </label>
    <label>To (one email per line):
      <textarea
        name=toEmailList
        class="to-email-list email-list"
        placeholder="foo@bar.com\nbaz@qux.net"
        required
      >${values.toEmailList || ''}</textarea>
    </label>
    <label>CC (one email per line):
      <textarea
        name=toCCList
        class="to-cc-list email-list"
        placeholder="foo@bar.com\nbaz@qux.net"
      >${values.toCCList || ''}</textarea>
    </label>
    <label>BCC (one email per line):
      <textarea
        name=toBCCList
        class="to-bcc-list email-list"
        placeholder="foo@bar.com\nbaz@qux.net"
      >${values.toBCCList || ''}</textarea>
    </label>
    <label>Reply To (one email per line):
      <textarea
        name=replyTo
        class="to-email-list email-list"
        placeholder="foo@bar.com\nbaz@qux.net"
      >${values.replyTo || ''}</textarea>
    </label>
    <label>Subject:
      <input
        type=text
        name=subject
        class="email-subject"
        placeholder="(no subject)"
        value="${values.subject ? encode(values.subject) : ''}"
      >
    </label>
    <label>Body (raw text):
      <textarea
        name=rawText
        class="email-raw-text email-list"
        placeholder="(empty)"
        required
      >${values.rawText ? encode(values.rawText) : ''}</textarea>
    </label>
    <label>Include prior manifest?
      <input
        type=checkbox
        name=includePriorManifest
        class="include-prior-manifest"
        ${values.includePriorManifest ? 'checked' : ''}
      >
    </label>
  `;
};

const renderWorkPreview = (manifest) => {
  let includePriorManifest = false;
  if (manifest.includePriorManifest) includePriorManifest = true;

  return /*html*/`
    <figure>
      <figcaption>An email will be sent with the following details:</figcaption>
      <p>From: <code>${manifest.fromEmail}</code></p>
      <p>To: <code>${manifest.toEmailList}</code></p>
      <p>CC: <code>${manifest.toCCList}</code></p>
      <p>BCC: <code>${manifest.toBCCList}</code></p>
      <p>Reply To: <code>${manifest.replyTo || manifest.fromEmail}</code></p>
      <p>Subject: <code>${manifest.subject}</code></p>
      <p>Body: <code>${manifest.rawText}</code></p>
      <hr>
      <p>Include prior manifest: ${includePriorManifest}</p>
    </figure>
  `;
};

const register = (lanes, users, harbors, shipments) => {
  Shipments = shipments;
  return name;
};

const hasDupes = list => {
  if (
    _.uniq( //4. remove duplicate dupe entries
      _.filter( //3. filter by keys with more than one occurance
        _.groupBy( //2. group by email as keys
          _.flattenDeep(list), //1. flatten nested list
          (n) => n
        ), 
        (n) => n.length > 1,
      )
    ).length
  ) return true;
  return false;
}

const checkDupes = (values) => {
  const toList = values.toEmailList.split('\n');
  const ccList = values.toCCList.length ?
    values.toCCList.split('\n') :
    [];
  const bccList = values.toBCCList ?
    values.toBCCList.split('\n') :
    [];

  if (hasDupes(toList) || hasDupes(ccList) || hasDupes(bccList)) {
    return false;
  }

  return true;
};

const checkBody = (values) => {
  if (values.rawText.length) return true;

  return false;
};

const update = (lane, values) => {
  if (
    checkDupes(values) && checkBody(values)
  ) {
    return true;
  }

  return false;
};

const fillReferenceText = (manifest, text) => {
  const referenceRegex = /\[\[([a-zA-Z0-9_.:-]+)\]\]/g;
  const strictReferenceRegex = /\[\[\[([a-zA-Z0-9_.:-]+)\]\]\]/g;

  const referencedValueText = text.replace(
    strictReferenceRegex, 
    (match, target) => {
      const value = JSON.stringify(_.get(manifest, target), null, '\t');
      return value;
    }
  ).replace(referenceRegex, (match, target) => {
    const value = _.get(manifest, target);
    return value;
  });
  return referencedValueText;
};

const work = (lane, manifest) => {
  let exitCode = 1;
  if (manifest.includePriorManifest && manifest.prior_manifest) {
    const priorManifestJson = JSON.stringify(
      manifest.prior_manifest, null, '\t',
    );
    manifest.rawText += `\nPrior manifest:\n${priorManifestJson}`;
  }
  const referencedSubject = fillReferenceText(manifest, manifest.subject);
  const referencedText = fillReferenceText(manifest, manifest.rawText);

  try {
    H.Email.send({
      from: manifest.fromEmail,
      to: manifest.toEmailList.split('\n'),
      cc: manifest.toCCList.split('\n'),
      bcc: manifest.toBCCList.split('\n'),
      replyTo: manifest.replyTo.split('\n'),
      subject: referencedSubject || manifest.subject,
      html: referencedText || manifest.rawText,
    });
    exitCode = 0;
  } catch (err) {
    error(JSON.stringify(err, null, '\t'));
    const shipment = Shipments.findOne(manifest.shipment_id);
    const key = new Date();
    shipment.stderr[key] = err;
    Shipments.update(shipment._id, { $set: { stderr: shipment.stderr } });
    manifest.error = err;
  }

  $H.call('Lanes#end_shipment', lane, exitCode, manifest);
};

module.exports = {
  render_input: renderInput,
  render_work_preview: renderWorkPreview,
  register,
  update,
  work,
};
