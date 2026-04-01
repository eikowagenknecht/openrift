import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/_app/privacy-policy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <article className="prose dark:prose-invert mx-auto max-w-2xl px-3 py-3">
      <h1>Privacy Policy</h1>

      <h2>1. Controller</h2>
      <p>The controller responsible for data processing on this website is:</p>
      <p>
        Eiko Wagenknecht
        <br />
        Burgwedeler Str. 77
        <br />
        30657 Hannover
        <br />
        Germany
      </p>
      <p>
        E-Mail: <a href="mailto:support@openrift.app">support@openrift.app</a>
      </p>

      <h2>2. General information on data processing</h2>
      <p>
        We process personal data of our users only to the extent necessary to provide a functioning
        website and our content and services. The processing of personal data of our users takes
        place regularly only with the consent of the user. An exception applies in cases where prior
        consent cannot be obtained for practical reasons and the processing of the data is permitted
        by law.
      </p>

      <h2>3. Legal basis</h2>
      <p>
        Insofar as we obtain consent for the processing of personal data, Art. 6(1)(a) GDPR serves
        as the legal basis. When processing personal data that is necessary for the performance of a
        contract to which the data subject is a party, Art. 6(1)(b) GDPR serves as the legal basis.
        This also applies to processing operations that are necessary for pre-contractual measures.
        Insofar as processing of personal data is necessary to fulfill a legal obligation to which
        our company is subject, Art. 6(1)(c) GDPR serves as the legal basis. If processing is
        necessary to protect a legitimate interest of our company or a third party, and the
        interests, fundamental rights, and freedoms of the data subject do not override the former
        interest, Art. 6(1)(f) GDPR serves as the legal basis.
      </p>

      <h2>4. Data retention</h2>
      <p>
        Personal data will be stored only for as long as necessary for the respective purpose. Once
        the purpose no longer applies, the data is routinely blocked or erased in accordance with
        legal requirements.
      </p>

      <h2>5. Server log files</h2>
      <p>
        When you visit our website, our web server automatically collects and stores information in
        server log files that your browser transmits to us. This includes:
      </p>
      <ul>
        <li>Browser type and version</li>
        <li>Operating system</li>
        <li>Referrer URL</li>
        <li>IP address (anonymized)</li>
        <li>Date and time of the request</li>
      </ul>
      <p>
        This data cannot be attributed to specific persons. This data is not combined with other
        data sources. The data is processed on the basis of Art. 6(1)(f) GDPR, as the operator has a
        legitimate interest in the technically error-free presentation and optimization of the
        website.
      </p>

      <h2>6. Cookies</h2>
      <p>
        This website uses cookies. Cookies are small text files that are stored on your device by
        your browser. They do not cause any damage.
      </p>
      <p>
        We use cookies exclusively for technically necessary purposes, such as maintaining your
        login session. These cookies are essential for the operation of the website and are set on
        the basis of Art. 6(1)(f) GDPR. The website operator has a legitimate interest in storing
        technically necessary cookies for the technically error-free and optimized provision of its
        services.
      </p>
      <p>
        You can configure your browser to inform you about the setting of cookies, to allow cookies
        only on a case-by-case basis, to exclude the acceptance of cookies in general, and to enable
        the automatic deletion of cookies when the browser is closed. Disabling cookies may limit
        the functionality of this website.
      </p>

      <h2>7. User registration</h2>
      <p>
        You can register on our website to access additional features. The data entered during
        registration is used solely for the purpose of using the service. The following data is
        collected during registration:
      </p>
      <ul>
        <li>E-mail address</li>
        <li>Display name (optional)</li>
        <li>Password (stored in hashed form only)</li>
      </ul>
      <p>
        The legal basis for processing this data is Art. 6(1)(a) GDPR if the user has given consent,
        or Art. 6(1)(b) GDPR if the registration is necessary for the fulfillment of a contract or
        for pre-contractual measures.
      </p>
      <p>
        Session data (IP address, user agent) is collected to protect your account against
        unauthorized access. This processing is based on Art. 6(1)(f) GDPR (legitimate interest in
        account security).
      </p>

      <h2>8. OAuth login (Google, Discord)</h2>
      <p>
        You may register and log in using third-party OAuth providers (Google, Discord). When you
        choose this option, the respective provider transmits your name, e-mail address, and profile
        picture to us. We store this data to create and manage your account.
      </p>
      <p>
        The legal basis is Art. 6(1)(a) GDPR (consent). You can revoke access at any time through
        the respective provider&apos;s account settings.
      </p>

      <h2>9. Gravatar</h2>
      <p>
        We use the Gravatar service provided by Automattic Inc. (60 29th Street #343, San Francisco,
        CA 94110, USA) to display user profile images. When you register, a SHA-256 hash of your
        e-mail address is sent to Gravatar to check whether a profile image is stored there. The
        Gravatar privacy policy is available at:{" "}
        <a href="https://automattic.com/privacy/" target="_blank" rel="noreferrer">
          https://automattic.com/privacy/
        </a>
      </p>
      <p>
        The legal basis is Art. 6(1)(f) GDPR (legitimate interest in an appealing user interface).
      </p>

      <h2>10. External links</h2>
      <p>
        Our website contains links to external websites. Some of these may be affiliate links. When
        you click these links, you are redirected to the respective third-party website, which may
        collect data according to its own privacy policy. We receive no personal data from these
        providers.
      </p>

      <h2>11. External content</h2>
      <p>
        Some content, such as card images, is loaded from external servers. Your browser establishes
        a direct connection to these servers when displaying the content, transmitting your IP
        address. This processing is based on Art. 6(1)(f) GDPR (legitimate interest in displaying
        the content that constitutes the core functionality of this service).
      </p>

      <h2>12. Your rights</h2>
      <p>You have the following rights with respect to your personal data:</p>
      <ul>
        <li>Right of access (Art. 15 GDPR)</li>
        <li>Right to rectification (Art. 16 GDPR)</li>
        <li>Right to erasure (Art. 17 GDPR)</li>
        <li>Right to restriction of processing (Art. 18 GDPR)</li>
        <li>Right to data portability (Art. 20 GDPR)</li>
        <li>Right to object (Art. 21 GDPR)</li>
        <li>Right to withdraw consent (Art. 7(3) GDPR)</li>
        <li>Right to lodge a complaint with a supervisory authority (Art. 77 GDPR)</li>
      </ul>
      <p>
        You can delete your account and all associated data at any time from your profile settings.
        For any other requests, please contact us at the e-mail address listed above.
      </p>

      <h2>13. Supervisory authority</h2>
      <p>The competent supervisory authority for data protection matters is:</p>
      <p>
        Die Landesbeauftragte für den Datenschutz Niedersachsen
        <br />
        Prinzenstraße 5<br />
        30159 Hannover
        <br />
        Germany
        <br />
        <a href="https://www.lfd.niedersachsen.de" target="_blank" rel="noreferrer">
          www.lfd.niedersachsen.de
        </a>
      </p>

      <h2>14. Changes to this privacy policy</h2>
      <p>
        We reserve the right to update this privacy policy to reflect changes in our data processing
        practices or legal requirements. The current version is always available on this page.
      </p>

      <p className="text-muted-foreground text-sm">Last updated: March 2026</p>
    </article>
  );
}
