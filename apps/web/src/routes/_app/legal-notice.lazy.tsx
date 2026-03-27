import { Link, createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/_app/legal-notice")({
  component: LegalNoticePage,
});

function LegalNoticePage() {
  return (
    <article className="prose dark:prose-invert mx-auto mt-6 max-w-2xl">
      <h1>Legal Notice</h1>

      <h2>Responsible for this site</h2>
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
        USt-ID: DE308816328
        <br />
        E-Mail: <a href="mailto:support@openrift.app">support@openrift.app</a>
      </p>

      <h2>Disclaimer</h2>

      <h3>Content of the online offer</h3>
      <p>
        The author assumes no warranty for the currentness, correctness, completeness, or quality of
        the provided information. Liability claims against the author relating to material or
        non-material damage caused by the use or non-use of the provided information, or by the use
        of incorrect or incomplete information, are generally excluded, unless the author is proven
        to have acted with willful intent or gross negligence.
      </p>
      <p>
        All offerings are non-binding. The author expressly reserves the right to change,
        supplement, or delete parts of the pages or the entire offering without prior notice, or to
        cease publication temporarily or permanently.
      </p>

      <h3>References and links</h3>
      <p>
        For direct or indirect references to external websites (&quot;hyperlinks&quot;) that lie
        outside the area of responsibility of the author, a liability obligation would only come
        into force if the author had knowledge of the content and it were technically possible and
        reasonable for the author to prevent use in the event of unlawful content.
      </p>
      <p>
        The author hereby expressly declares that at the time of linking, no illegal content was
        recognizable on the linked pages. The author has no influence on the current and future
        design, content, or authorship of the linked pages. Therefore, the author hereby expressly
        dissociates from all content of all linked pages that was changed after the link was set.
        For illegal, incorrect, or incomplete content, and especially for damages arising from the
        use or non-use of such information, only the provider of the page to which reference was
        made is liable, not the one who merely links to the respective publication.
      </p>

      <h3>Copyright and trademark law</h3>
      <p>
        The author endeavors to observe the copyrights of the images, graphics, sound documents,
        video sequences, and texts used in all publications, to use images, graphics, sound
        documents, video sequences, and texts created by the author, or to use license-free
        graphics, sound documents, video sequences, and texts.
      </p>
      <p>
        All brand names and trademarks mentioned on this website and possibly protected by third
        parties are subject without restriction to the provisions of the applicable trademark law
        and the ownership rights of the respective registered owners. The mere mention of a
        trademark does not imply that it is not protected by the rights of third parties.
      </p>
      <p>
        The copyright for published objects created by the author remains solely with the author of
        the pages. Any reproduction or use of such graphics, sound documents, video sequences, and
        texts in other electronic or printed publications is not permitted without the express
        consent of the author.
      </p>

      <h3>Riot Games</h3>
      <p>
        OpenRift isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of
        Riot Games or anyone officially involved in producing or managing Riot Games properties.
        Riot Games, and all associated properties are trademarks or registered trademarks of Riot
        Games, Inc.
      </p>

      <h3>Legal validity of this disclaimer</h3>
      <p>
        This disclaimer is to be regarded as part of the internet offer from which you were referred
        to this page. If sections or individual terms of this statement are not legal or correct,
        the content or validity of the other parts remain uninfluenced by this fact.
      </p>

      <h2>Privacy Policy</h2>
      <p>
        See our <Link to="/privacy-policy">Privacy Policy</Link>.
      </p>
    </article>
  );
}
