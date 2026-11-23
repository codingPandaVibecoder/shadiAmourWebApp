// UK-only Islamic marriage guidance pages.
// Replaces the retired /muslim-marriage, /halal-marriage, /muslim-matrimonial,
// /find-muslim-spouse, /muslim-singles-uk, /divorced-muslim-marriage and Pakistan
// rishta landing pages. See views/legacy-page-redirects.js for the 301s.

const UK_MARRIAGE_GUIDANCE_PAGES = [
  {
    path: "/is-nikah-legal-in-uk",
    pageTitle: "Is a Nikah Legal in the UK? How to Make It Valid (2026)",
    h1: "Is a Nikah Legal in the UK? What Every Muslim Couple Must Know",
    heroSubtitle: "A nikah on its own is often not a legally recognised marriage in England and Wales. Here is what that means for your rights, and the exact steps to make your marriage both Islamically valid and legally protected.",
    metaDescription: "Is nikah legally binding in the UK? Learn why a nikah alone may not count, how to register, and the exact steps to protect your marriage in 2026.",
    keywords: "is nikah legal in uk, is nikah legally binding in uk, how to register nikah in uk, nikah legal marriage uk, is online nikah valid in uk, nikah uk law",
    canonicalPath: "/is-nikah-legal-in-uk",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Looking for a Spouse Who Takes Deen and Marriage Seriously?",
    ctaSubtext: "Create your free profile on shadiAmour and connect through a halal, family-friendly process. Parents and guardians can register on behalf of a family member.",
    relatedLinks: [
      { url: "/mahr-in-the-uk", label: "Mahr in the UK" },
      { url: "/wali-for-nikah-uk", label: "Wali for Nikah" },
      { url: "/nikah-ceremony-uk-step-by-step", label: "Nikah Ceremony Step by Step" },
      { url: "/khula-in-the-uk", label: "Khula in the UK" }
    ],
    pageFaqSchema: [
      { q: "Is a nikah legally binding in the UK?", a: "Only if the ceremony also meets UK legal requirements (registered venue or registrar present, and legal notice given). A nikah alone is usually not recognised as a legal marriage in England and Wales." },
      { q: "How do I register my nikah in the UK?", a: "You cannot simply register a past nikah. You give notice at your register office and have a civil ceremony. That creates the legal marriage from that date." },
      { q: "Is an online nikah valid in the UK?", a: "Not as a UK legal marriage. It may be religiously valid depending on scholarly view, but it will not give you legal marriage rights." },
      { q: "Do I need two ceremonies?", a: "Not always. If your mosque is registered for marriages and an authorised person or registrar is present, the nikah can also be the legal marriage." },
      { q: "How long does it take?", a: "At least 28 days after giving notice, and up to 70 days if the Home Office is involved." },
      { q: "Can I marry legally at 16 or 17?", a: "No. The minimum age to marry in England and Wales is 18. Forced marriage is a crime in the UK." }
    ],
    pageFaqs: [
      { q: "Is a nikah legally binding in the UK?", a: "Only if the ceremony also meets UK legal requirements (registered venue or registrar present, and legal notice given). A nikah alone is usually not recognised as a legal marriage in England and Wales." },
      { q: "How do I register my nikah in the UK?", a: "You cannot simply register a past nikah. You give notice at your register office and have a civil ceremony. That creates the legal marriage from that date." },
      { q: "Is an online nikah valid in the UK?", a: "Not as a UK legal marriage. It may be religiously valid depending on scholarly view, but it will not give you legal marriage rights." },
      { q: "Do I need two ceremonies?", a: "Not always. If your mosque is registered for marriages and an authorised person or registrar is present, the nikah can also be the legal marriage." },
      { q: "How long does it take?", a: "At least 28 days after giving notice, and up to 70 days if the Home Office is involved." },
      { q: "Can I marry legally at 16 or 17?", a: "No. The minimum age to marry in England and Wales is 18. Forced marriage is a crime in the UK." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> in England and Wales, a nikah on its own is often not a legally recognised marriage. It is a valid religious contract in Islam, but UK law only recognises a marriage when it follows the legal ceremony and registration rules. If you want both Islamic validity and legal protection, you need both.</p>

        <p class="text-gray-700 mb-6 leading-relaxed">This guide explains the difference, what you could lose without a legal marriage, and the exact steps to fix it, whether you are planning your nikah or have already had one.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Nikah and legal marriage are not the same thing</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A nikah is an Islamic marriage contract with consent from both sides, witnesses and a mahr. UK law has its own requirements: the marriage must take place in a register office, an approved venue, or a place of worship registered for marriages, and the couple must give legal notice beforehand. A nikah held at home, in a hall or at an unregistered mosque without these steps is usually treated as a religious ceremony only.</p>
        <p class="text-gray-700 mb-6 leading-relaxed">In 2020 the Court of Appeal in <em>Akhter v Khan</em> held that a nikah-only ceremony in that case did not create a marriage, or even a void marriage, under English law. Since then, many Muslim families have become far more aware of the gap.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Why it matters: what a nikah-only couple can lose</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Divorce protection:</strong> the courts' usual financial powers on divorce may not apply, which can leave a spouse, often the wife, without a claim to the home, savings or pension.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Inheritance:</strong> a spouse in a non-legal marriage may not inherit automatically if the other dies without a will.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Next of kin and benefits:</strong> hospital decisions, bereavement support and some pension or tax benefits are tied to legal marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Immigration:</strong> a spouse visa application relies on a legally valid marriage. See our guide to the <a href="/blog/muslim-spouse-visa-uk-2026-nikah-sponsorship-and-home-office-requirements" class="text-primary hover:underline">Muslim spouse visa in the UK</a>.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Children:</strong> children are protected either way, but the legal position of the parents affects practical issues such as financial support and housing.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Three ways to make your marriage legal (England and Wales)</h2>

        <h3>1. Civil ceremony plus nikah</h3>
        <p class="text-gray-700 mb-6 leading-relaxed">Marry at a register office or approved venue, then hold your nikah and walima as you wish. Many couples do the civil ceremony first, even the same week, so the legal marriage is secure before the religious celebration.</p>

        <h3>2. Nikah at a mosque registered for marriages</h3>
        <p class="text-gray-700 mb-6 leading-relaxed">Some mosques are registered for marriages, and the ceremony is conducted with an authorised person or a registrar present, so the nikah is also the legal marriage. Many mosques are not registered, so always ask. You can check the official list of places of worship registered for marriage on GOV.UK.</p>

        <h3>3. Already had a nikah only?</h3>
        <p class="text-gray-700 mb-6 leading-relaxed">You can still have a civil marriage now. Be aware that the legal marriage starts from the civil ceremony, not from the date of your earlier nikah. Speak to a family solicitor if you have been together for years and have property or children.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Step by step: giving notice and getting married legally</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">1</span><span class="text-gray-700">Choose your venue first. The venue is part of your legal notice, and changing it later means giving notice again.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">2</span><span class="text-gray-700">Both of you give notice in person at your local register office. You normally need to have lived in that registration district for at least seven days beforehand.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">3</span><span class="text-gray-700">Bring original documents, such as ID, proof of address and details of any previous marriage or divorce. Requirements vary, so check with your council.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">4</span><span class="text-gray-700">Wait at least 28 days. Your notice is displayed at the register office. It stays valid for 12 months. Couples subject to immigration control may be referred to the Home Office, which can extend the wait to 70 days.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">5</span><span class="text-gray-700">Receive your marriage schedule and hold the ceremony with two witnesses and the authorised officiant or registrar.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">6</span><span class="text-gray-700">Collect your marriage certificate. Keep it safe. This is your legal proof of marriage.</span></li>
        </ul>
        <p class="text-gray-700 mb-6 leading-relaxed">Fees differ by council and circumstances, so check the current amount with your register office or GOV.UK before booking.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Scotland, Northern Ireland, nikah abroad and online nikah</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Marriage law in Scotland and Northern Ireland is separate from England and Wales, with different notice and officiant rules. Contact the local registrar before you plan. A nikah done online or by phone is not a UK legal marriage. A marriage abroad may be recognised if it was valid where it took place, but this depends on the country and the circumstances, so get legal advice first.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Is the law changing?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">In 2026 the UK Government opened a consultation on reforming weddings law in England and Wales, building on the Law Commission's 2022 recommendations. The Law Commission did not propose shortening the 28-day notice period. Until new rules are passed, the current law applies. Check GOV.UK for updates.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Islamic requirements still apply</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A legal marriage does not replace the Islamic requirements. A valid nikah needs the free consent of both parties, witnesses, an agreed mahr and, according to most schools, a wali for the bride. Read our guides on <a href="/mahr-in-the-uk" class="text-primary hover:underline">mahr in the UK</a> and the <a href="/wali-for-nikah-uk" class="text-primary hover:underline">wali for nikah</a>. If your marriage ends, our guide to <a href="/blog/talaq-in-the-uk-2026-islamic-and-legal-steps-explained-simply" class="text-primary hover:underline">talaq in the UK</a> explains the Islamic and legal steps.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Common mistakes to avoid</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Assuming a mosque nikah certificate is a legal marriage certificate.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Delaying the civil registration "until later".</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Booking the venue after giving notice.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Not telling the imam you want the ceremony to also be legally valid.</span></li>
        </ul>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  },
  {
    path: "/mahr-in-the-uk",
    pageTitle: "Mahr in Islam: How Much Is Right? UK Muslim Guide (2026)",
    h1: "Mahr in the UK: Meaning, Amount, and How to Agree It Before Your Nikah",
    heroSubtitle: "Mahr is the bride's right, not a price tag. Here is what it means, how much is reasonable, how to word it in the nikah contract, and what UK law makes of it.",
    metaDescription: "What is mahr, how much should it be, and does it matter in UK law? A practical halal guide for British Muslim couples before the nikah.",
    keywords: "mahr in uk, how much mahr, what is mahr in islam, mahr amount uk, deferred mahr, mahr in nikah contract",
    canonicalPath: "/mahr-in-the-uk",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Ready to Begin Your Halal Marriage Journey?",
    ctaSubtext: "Join shadiAmour free and connect with serious, verified UK Muslim profiles. You can also book a free, confidential call with a matchmaking consultant.",
    relatedLinks: [
      { url: "/is-nikah-legal-in-uk", label: "Is a Nikah Legal in the UK?" },
      { url: "/wali-for-nikah-uk", label: "Wali for Nikah" },
      { url: "/nikah-ceremony-uk-step-by-step", label: "Nikah Ceremony Step by Step" },
      { url: "/khula-in-the-uk", label: "Khula in the UK" }
    ],
    pageFaqSchema: [
      { q: "Is mahr compulsory in Islam?", a: "Yes. It is a right of the bride and is part of a valid nikah." },
      { q: "What is the minimum mahr in Islam?", a: "Scholars differ. Some schools mention minimum values, while others say anything lawful and valuable can be mahr. Ask your imam which view applies to you." },
      { q: "Can the bride waive her mahr?", a: "She may choose to forgo part or all of it only if she does so freely and willingly, not under pressure." },
      { q: "Who receives the mahr, the bride or her family?", a: "The bride. It is her property." },
      { q: "Can mahr be paid in instalments?", a: "Yes, if both agree and it is written clearly in the nikah contract." },
      { q: "Is mahr the same as a dowry?", a: "No. A dowry is a payment or gift from the bride's family. Mahr comes from the groom to the bride." }
    ],
    pageFaqs: [
      { q: "Is mahr compulsory in Islam?", a: "Yes. It is a right of the bride and is part of a valid nikah." },
      { q: "What is the minimum mahr in Islam?", a: "Scholars differ. Some schools mention minimum values, while others say anything lawful and valuable can be mahr. Ask your imam which view applies to you." },
      { q: "Can the bride waive her mahr?", a: "She may choose to forgo part or all of it only if she does so freely and willingly, not under pressure." },
      { q: "Who receives the mahr, the bride or her family?", a: "The bride. It is her property." },
      { q: "Can mahr be paid in instalments?", a: "Yes, if both agree and it is written clearly in the nikah contract." },
      { q: "Is mahr the same as a dowry?", a: "No. A dowry is a payment or gift from the bride's family. Mahr comes from the groom to the bride." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> mahr is a gift from the groom to the bride that becomes her property when the nikah is agreed. Islam sets no fixed amount. The Sunnah encourages ease and moderation, so the right amount is one that is agreed willingly, is realistic for the groom and is written down clearly.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What is mahr?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Mahr (sometimes called dower) is a required part of the Islamic marriage contract. The Quran tells men to give women their marriage gift willingly. It belongs to the bride alone. It is not a dowry paid by her family, and it is not payment for the marriage. Her family, including her wali, may not take it from her without her consent.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How much mahr should it be?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">There is no maximum in the Quran. Scholars differ on whether a minimum exists: the Hanafi and Maliki schools mention minimum values, while others say anything of value can be mahr. Hadith reports encourage making marriage easy rather than costly. In practice, a good mahr is:</p>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">agreed freely by the bride, not set under pressure from either family;</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">affordable for the groom, without taking on debt to impress others;</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">meaningful to the bride, not a token amount that is never paid;</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">not a competition or a status symbol.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Common forms of mahr in the UK</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Form</th><th>Examples</th><th>Things to check</th></tr>
            </thead>
            <tbody>
              <tr><td>Cash</td><td>A set sum in pounds</td><td>Write the exact figure and currency</td></tr>
              <tr><td>Gold or jewellery</td><td>Gold set given at the nikah</td><td>Record the weight and who keeps it afterwards</td></tr>
              <tr><td>Property or asset</td><td>Share of a home, a car</td><td>Seek legal advice so ownership is clearly documented</td></tr>
              <tr><td>Other lawful gifts</td><td>Paying for Hajj or Umrah, education</td><td>Write exactly what and by when</td></tr>
            </tbody>
          </table>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Prompt and deferred mahr</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Mahr can be paid immediately (prompt), later (deferred), or part of each. Deferred mahr is still a debt owed to the wife. It becomes due at the date agreed in the contract, or on divorce or death if no date is set. Many problems come from deferred mahr that was never written down or discussed. Always agree the amount and the due point in advance.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How to agree your mahr: a simple process</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Talk privately first as a couple, then involve family.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Decide the form and amount and whether it is prompt or deferred.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Put it in writing in the nikah contract: amount, form, when it is due, and signatures of both parties and witnesses.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Pay or hand over the prompt part at or soon after the nikah, and keep proof.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Keep a copy of the contract in a safe place. Both spouses should have one.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Does mahr matter in UK law?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Courts in England have in some cases treated a mahr written in a nikah contract as an enforceable agreement, but the outcome depends on the facts and, importantly, on whether the marriage is also legally valid. A nikah-only marriage may leave the wife with fewer legal options. For that reason, we recommend the civil registration steps in our guide <a href="/is-nikah-legal-in-uk" class="text-primary hover:underline">Is a nikah legal in the UK?</a> Take advice from a family solicitor if a large mahr, property or children are involved.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Mistakes to avoid</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Writing a token amount, then claiming later it was "only symbolic".</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Letting parents or in-laws keep the mahr.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Leaving deferred mahr undefined.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Not having a written contract.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Promising more than the groom can pay.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Mahr and divorce</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">If a marriage ends, any unpaid mahr remains owed to the wife in Islam. Read our guide to <a href="/blog/talaq-in-the-uk-2026-islamic-and-legal-steps-explained-simply" class="text-primary hover:underline">talaq in the UK</a> for the Islamic and legal steps.</p>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  },
  {
    path: "/wali-for-nikah-uk",
    pageTitle: "Wali for Nikah in the UK: Role, Rules and What If Dad Refuses",
    h1: "Wali for Nikah in the UK: Who Can Be Your Wali and What If Your Family Refuses?",
    heroSubtitle: "The wali protects the bride's interests in the nikah — it is a duty of care, never control. Here is what the schools say, who can act, and what to do when a family says no.",
    metaDescription: "Do you need a wali for nikah in the UK? Learn the wali's role, scholarly views, who can be a wali, and what to do if your father refuses.",
    keywords: "wali for nikah uk, what is a wali in islam, do you need a wali for nikah, nikah without wali, wali refuses marriage, wali for revert",
    canonicalPath: "/wali-for-nikah-uk",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Families Are Welcome on shadiAmour",
    ctaSubtext: "Parents, guardians and siblings can create a profile on behalf of a family member, so the process stays respectful and family-led.",
    relatedLinks: [
      { url: "/is-nikah-legal-in-uk", label: "Is a Nikah Legal in the UK?" },
      { url: "/mahr-in-the-uk", label: "Mahr in the UK" },
      { url: "/istikhara-for-marriage", label: "Istikhara for Marriage" },
      { url: "/nikah-ceremony-uk-step-by-step", label: "Nikah Ceremony Step by Step" }
    ],
    pageFaqSchema: [
      { q: "Can a woman marry without a wali?", a: "Scholars differ. Most require a wali. The Hanafi school allows an adult woman to marry herself with conditions. Ask your imam which view applies in your case." },
      { q: "Who is the wali if my father has passed away?", a: "Usually the paternal grandfather, then a brother, then a paternal uncle, subject to the school you follow." },
      { q: "Can a revert woman have a wali?", a: "Yes. If she has no Muslim male relative, a trusted imam or Muslim authority can act as wali." },
      { q: "Can my father force me to marry someone?", a: "No. Your free consent is required in Islam, and forced marriage is illegal in the UK." },
      { q: "Can I choose my own wali?", a: "Only within the accepted order and rules. If the nearest wali is unavailable or unfit, a qualified imam can advise who may act." },
      { q: "Do men need a wali?", a: "No." }
    ],
    pageFaqs: [
      { q: "Can a woman marry without a wali?", a: "Scholars differ. Most require a wali. The Hanafi school allows an adult woman to marry herself with conditions. Ask your imam which view applies in your case." },
      { q: "Who is the wali if my father has passed away?", a: "Usually the paternal grandfather, then a brother, then a paternal uncle, subject to the school you follow." },
      { q: "Can a revert woman have a wali?", a: "Yes. If she has no Muslim male relative, a trusted imam or Muslim authority can act as wali." },
      { q: "Can my father force me to marry someone?", a: "No. Your free consent is required in Islam, and forced marriage is illegal in the UK." },
      { q: "Can I choose my own wali?", a: "Only within the accepted order and rules. If the nearest wali is unavailable or unfit, a qualified imam can advise who may act." },
      { q: "Do men need a wali?", a: "No." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> a wali is the guardian who represents the bride in her nikah. Most scholars require a wali for a valid nikah, while the Hanafi school allows an adult woman to marry herself with conditions. Because views differ, speak to a qualified imam or scholar about your own situation.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What is a wali?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The wali protects the bride's interests, helps ensure the match is suitable and takes part in the marriage contract. It is a role of care and responsibility, not control. The wali cannot force a marriage, and a bride must always freely consent. Men do not need a wali.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Do you need a wali? What the schools say</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>View</th><th>Position</th></tr>
            </thead>
            <tbody>
              <tr><td>Maliki, Shafi'i, Hanbali</td><td>A wali is required for a valid nikah, based on hadith such as "no marriage without a wali" reported in Abu Dawud and Tirmidhi.</td></tr>
              <tr><td>Hanafi</td><td>An adult, sane woman may contract her own marriage, though involving her wali is strongly recommended and the wali may object in some cases, such as an unsuitable match.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Most UK imams will ask for a wali at the nikah. If you follow a particular school, ask what it requires.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Who can be a wali?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">The usual order, with minor differences between schools, is the bride's father, then her paternal grandfather, then her brothers, then paternal uncles and other male relatives on the father's side. A wali is generally expected to be a Muslim, an adult, of sound mind and trustworthy.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">No Muslim male relatives? Reverts and absent families</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Many sisters in the UK, especially reverts or those with family overseas or estranged, have no suitable wali. In this case, scholars commonly say a Muslim authority steps in, such as a trusted imam, a mosque committee or a Shariah council representative. Speak to your local mosque early, so there is no delay.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What if your father or wali refuses?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A wali has a duty to act in the bride's best interests. Islam recognises that some refusals are valid and some are not. The Quran warns against preventing women from marrying suitable partners, and a well-known hadith tells guardians to agree when a man whose faith and character they are pleased with proposes.</p>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Likely valid concerns</th><th>Not valid reasons</th></tr>
            </thead>
            <tbody>
              <tr><td>Poor religious practice or character</td><td>Ethnicity, race or caste</td></tr>
              <tr><td>Evidence of harm, dishonesty or abuse</td><td>Pure personal preference or family pride</td></tr>
              <tr><td>A serious, proven incompatibility</td><td>Wanting a wealthier or more "famous" family</td></tr>
              <tr><td>Being forced or pressured into the match</td><td>Unwillingness to discuss the proposal at all</td></tr>
            </tbody>
          </table>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Steps to take if your family says no</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Talk calmly and ask exactly what the concern is.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Arrange a respectful meeting between the families.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Involve a respected relative or imam as a mediator.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Pray istikhara and ask for clarity.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">If the refusal is without valid reason, ask a qualified imam or scholar whether the matter can pass to another wali or a Muslim authority. Do not rush or marry in secret.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Keep records of what was discussed.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Wali and UK law</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">For an adult marrying in England and Wales, UK law does not require a wali for the civil marriage. Legal notice is given by the couple. The wali matters for the Islamic nikah. Someone under 18 cannot marry in England and Wales. Forced marriage is a crime. If you are being pressured or are in danger, contact the Forced Marriage Unit through GOV.UK, or call 999 in an emergency. See also <a href="/is-nikah-legal-in-uk" class="text-primary hover:underline">Is a nikah legal in the UK?</a></p>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  },
  {
    path: "/khula-in-the-uk",
    pageTitle: "Khula in the UK: How a Muslim Wife Can Seek Divorce (2026)",
    h1: "Khula in the UK: How a Muslim Wife Can Seek an Islamic Divorce",
    heroSubtitle: "Khula is the Islamic route for a wife to end a marriage. Here is how it differs from talaq and faskh, what a Shariah council can and cannot do, and why you still need the civil divorce.",
    metaDescription: "How does khula work in the UK? Learn the Islamic steps, the role of Shariah councils, and the civil divorce process every Muslim wife should know.",
    keywords: "khula in uk, what is khula, how to get khula in uk, khula without husband consent, shariah council khula, islamic divorce uk",
    canonicalPath: "/khula-in-the-uk",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Starting Again After Divorce?",
    ctaSubtext: "Create a free, confidential profile on shadiAmour when you are ready, and connect with serious UK Muslim profiles through a family-friendly process.",
    relatedLinks: [
      { url: "/is-nikah-legal-in-uk", label: "Is a Nikah Legal in the UK?" },
      { url: "/mahr-in-the-uk", label: "Mahr in the UK" },
      { url: "/wali-for-nikah-uk", label: "Wali for Nikah" },
      { url: "/istikhara-for-marriage", label: "Istikhara for Marriage" }
    ],
    pageFaqSchema: [
      { q: "What is khula in Islam?", a: "A divorce initiated by the wife, usually by returning her mahr or agreeing other compensation." },
      { q: "Can I get khula without my husband's consent?", a: "Scholars differ. Many require his consent, while some allow a judge or recognised authority to dissolve the marriage in certain cases. A qualified scholar can advise on your situation." },
      { q: "Does khula end my marriage in UK law?", a: "No. If your marriage is legally recognised, you need a civil divorce too." },
      { q: "Do I have to give back my mahr?", a: "Often yes, in whole or in part, but only as agreed. The amount is agreed freely and should not be forced." },
      { q: "How long does a Shariah council take?", a: "It varies. Councils are not regulated courts, so ask about their process and any fees first." },
      { q: "Can I remarry after khula?", a: "Only after the Islamic divorce is complete and the iddah has passed, and, if you were legally married, after your civil divorce is final." }
    ],
    pageFaqs: [
      { q: "What is khula in Islam?", a: "A divorce initiated by the wife, usually by returning her mahr or agreeing other compensation." },
      { q: "Can I get khula without my husband's consent?", a: "Scholars differ. Many require his consent, while some allow a judge or recognised authority to dissolve the marriage in certain cases. A qualified scholar can advise on your situation." },
      { q: "Does khula end my marriage in UK law?", a: "No. If your marriage is legally recognised, you need a civil divorce too." },
      { q: "Do I have to give back my mahr?", a: "Often yes, in whole or in part, but only as agreed. The amount is agreed freely and should not be forced." },
      { q: "How long does a Shariah council take?", a: "It varies. Councils are not regulated courts, so ask about their process and any fees first." },
      { q: "Can I remarry after khula?", a: "Only after the Islamic divorce is complete and the iddah has passed, and, if you were legally married, after your civil divorce is final." }
    ],
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> khula is the Islamic way for a wife to end a marriage, usually by returning her mahr or agreeing other compensation. In the UK it does not replace the civil divorce. If your marriage is legally recognised, you need both an Islamic divorce and a civil one.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What is khula?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Khula is a divorce started by the wife. A well-known hadith records that the wife of Thabit ibn Qays disliked staying married to him, returned the garden he had given her, and the Prophet (peace be upon him) directed the separation. Scholars use it as the basis for khula. It differs from talaq, which is pronounced by the husband.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Khula, talaq and faskh: the difference</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Term</th><th>Who starts it</th><th>Key point</th></tr>
            </thead>
            <tbody>
              <tr><td>Talaq</td><td>Husband</td><td>Pronounced by the husband. See our <a href="/blog/talaq-in-the-uk-2026-islamic-and-legal-steps-explained-simply" class="text-primary hover:underline">talaq guide</a>.</td></tr>
              <tr><td>Khula</td><td>Wife</td><td>Usually with the husband's agreement, with mahr returned or other compensation agreed.</td></tr>
              <tr><td>Faskh</td><td>Judge or recognised authority</td><td>The marriage is dissolved on valid grounds, such as harm, neglect or failure to maintain, even without the husband's consent.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">Scholars differ on whether khula requires the husband's consent. Many hold that it does, while others allow a judge or qualified authority to dissolve the marriage if he refuses without good reason. In the UK, Shariah councils and scholars often work on this basis. Ask a qualified scholar which view applies to you.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Khula in the UK: step by step</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Consider reconciliation or mediation, unless there is abuse or danger. A trusted imam or family mediator can help.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Ask your husband for khula. Agree what you will return or give, such as all or part of your mahr, or other terms. It must be agreed freely.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">If he refuses or ignores you, contact a Shariah council or a qualified scholar. They are not courts and have no legal power, but they can review your case and may issue an Islamic divorce certificate.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Start your civil divorce if your marriage is legally recognised (see below).</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Observe iddah and wait for your Islamic and civil divorce to be complete before you consider remarrying.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Sort finances and children through the courts, not through a Shariah council. Take advice from a family solicitor.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Civil divorce in England and Wales</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">If your marriage is legally recognised, you must also divorce through the civil courts. Since 6 April 2022, divorce in England and Wales is no-fault. You must have been married at least one year. After your application is issued, there is a 20-week reflection period before you can apply for a conditional order, and then six weeks and one day before you can apply for the final order that legally ends the marriage. The court fee is currently about 628 pounds, so check GOV.UK for the current amount. Money and property are dealt with separately, and it is usually wise to settle them before the final order.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What if I only had a nikah?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">If you had a nikah but no legal marriage, the courts may not treat you as married. You may not have the usual divorce and financial rights, but you may still need an Islamic divorce to be free to remarry. See our guide <a href="/is-nikah-legal-in-uk" class="text-primary hover:underline">Is a nikah legal in the UK?</a> Speak to a family solicitor about property or children.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">The "limping marriage" problem</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">A "limping marriage" is when someone is legally divorced but still Islamically married. This can leave a woman unable to remarry in Islam. Avoid it by completing both the Islamic and civil processes, and keep copies of every certificate.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Your safety comes first</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">If you are experiencing abuse or fear for your safety, you do not need to wait for any religious process. Call 999 in an emergency. The National Domestic Abuse Helpline is available on 0808 2000 247. Islam does not require anyone to stay in a harmful marriage.</p>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  },
  {
    path: "/istikhara-for-marriage",
    pageTitle: "Istikhara for Marriage: How to Pray It Correctly (UK Guide)",
    h1: "Istikhara for Marriage: How to Pray It, What to Expect, and What to Do Next",
    heroSubtitle: "Istikhara is asking Allah for guidance on a decision — not waiting for a dream. Here is the prayer, the authentic dua, the myths to ignore, and the practical work that goes with it.",
    metaDescription: "How to pray istikhara for marriage, what to expect, common myths about dreams, and what to do next. A practical guide for British Muslims.",
    keywords: "istikhara for marriage, how to pray istikhara, istikhara dua for marriage, istikhara result, istikhara dream, istikhara for rishta",
    canonicalPath: "/istikhara-for-marriage",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Considering a Proposal?",
    ctaSubtext: "Browse verified UK Muslim profiles on shadiAmour and take your time to research, consult your family and pray istikhara before you decide.",
    relatedLinks: [
      { url: "/wali-for-nikah-uk", label: "Wali for Nikah" },
      { url: "/is-nikah-legal-in-uk", label: "Is a Nikah Legal in the UK?" },
      { url: "/nikah-ceremony-uk-step-by-step", label: "Nikah Ceremony Step by Step" },
      { url: "/mahr-in-the-uk", label: "Mahr in the UK" }
    ],
    pageFaqSchema: [
      { q: "How many days should I pray istikhara?", a: "There is no fixed number. Pray it when needed and continue until you reach clarity, while consulting and researching." },
      { q: "What if I do not see anything after istikhara?", a: "That is normal. The answer shows in how events unfold and in your heart, not necessarily in a dream." },
      { q: "Can I pray istikhara for someone else?", a: "You may make dua for them, but the istikhara prayer is for the person who must decide." },
      { q: "Can I pray istikhara after a decision?", a: "It is meant before deciding. After deciding, rely on Allah and keep making dua." },
      { q: "Can women pray istikhara during their period?", a: "The salah requires purity, so it is not prayed during menstruation. You can still make dua for guidance at that time." },
      { q: "Can I pray istikhara in English?", a: "The dua may be recited in Arabic, and many scholars permit supplementing with your own words in any language." }
    ],
    pageFaqs: [
      { q: "How many days should I pray istikhara?", a: "There is no fixed number. Pray it when needed and continue until you reach clarity, while consulting and researching." },
      { q: "What if I do not see anything after istikhara?", a: "That is normal. The answer shows in how events unfold and in your heart, not necessarily in a dream." },
      { q: "Can I pray istikhara for someone else?", a: "You may make dua for them, but the istikhara prayer is for the person who must decide." },
      { q: "Can I pray istikhara after a decision?", a: "It is meant before deciding. After deciding, rely on Allah and keep making dua." },
      { q: "Can women pray istikhara during their period?", a: "The salah requires purity, so it is not prayed during menstruation. You can still make dua for guidance at that time." },
      { q: "Can I pray istikhara in English?", a: "The dua may be recited in Arabic, and many scholars permit supplementing with your own words in any language." }
    ],
    howTo: {
      name: "How to pray istikhara for marriage",
      steps: [
        { name: "Prepare", text: "Make wudu and choose a calm time, ideally when your mind is settled." },
        { name: "Pray two rak'ahs", text: "Pray two voluntary rak'ahs with the normal Fatiha and surahs of your choice." },
        { name: "Recite the istikhara dua", text: "After the salah, recite the authentic istikhara dua from Sahih al-Bukhari, naming the matter you are deciding on." },
        { name: "Act with trust in Allah", text: "Keep making dua, consult trusted people, do your research, and observe how the matter unfolds." }
      ]
    },
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> istikhara means asking Allah for guidance. You pray two voluntary rak'ahs, recite the authentic istikhara dua, and then act with trust in Allah. You do not need a dream or a sign. It supports your research and consultation, it does not replace them.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What is istikhara?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Istikhara means seeking what is best from Allah. The Prophet (peace be upon him) taught it for decisions, and the narration in Sahih al-Bukhari says he taught his companions istikhara as he taught them a surah of the Quran. It is a sunnah prayer, suited to a lawful and uncertain matter such as accepting or declining a marriage proposal.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">How to pray istikhara for marriage</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Make wudu and choose a calm time, ideally when your mind is settled.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Pray two voluntary rak'ahs with the normal Fatiha and surahs of your choice.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">After the salah, recite the authentic istikhara dua from Sahih al-Bukhari. You may say it in Arabic or add your own words in English. When you reach the part about the matter, mention your need clearly, for example that you are deciding on a marriage proposal.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Then proceed with your decision-making. Keep making dua, consult trusted people, and observe what unfolds.</span></li>
        </ul>

        <h3>The istikhara dua (Sahih al-Bukhari 1166)</h3>
        <p class="arabic" dir="rtl" lang="ar">اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ، وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ، وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ. اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي، فَاصْرِفْهُ عَنِّي وَاقْدُرْ لِي الْخَيْرَ حَيْثُ كَانَ ثُمَّ أَرْضِنِي بِهِ</p>
        <p class="text-gray-700 mb-6 leading-relaxed"><strong>Transliteration:</strong> Allahumma inni astakhiruka bi 'ilmika, wa astaqdiruka bi qudratika, wa as'aluka min fadlika al-'azim, fa innaka taqdiru wa la aqdiru, wa ta'lamu wa la a'lamu, wa anta 'allamu al-ghuyub. Allahumma in kunta ta'lamu anna hadha al-amra khayrun li fi dini wa ma'ashi wa 'aqibati amri, faqdurhu li wa yassirhu li thumma barik li fihi, wa in kunta ta'lamu anna hadha al-amra sharrun li fi dini wa ma'ashi wa 'aqibati amri, fasrifhu 'anni waqdur li al-khayra haythu kana thumma ardini bihi.</p>
        <p class="text-gray-700 mb-6 leading-relaxed"><strong>Translation:</strong> O Allah, I seek Your guidance by virtue of Your knowledge, and I seek ability by virtue of Your power, and I ask You of Your great bounty. You have power, I have none. And You know, I know not. You are the Knower of hidden things. O Allah, if in Your knowledge this matter is good for me in my religion, my livelihood and my affairs, then ordain it for me, make it easy for me, and bless it for me. And if in Your knowledge this matter is bad for me in my religion, my livelihood and my affairs, then turn it away from me, and ordain for me the good wherever it may be, and make me content with it.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Do I need to see a dream?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">No. A dream is not required and not the standard sign. Many scholars say the answer appears through ease or difficulty in the matter and a settled or uneasy heart over time. Do not treat a dream as a binding answer, and do not let anyone else tell you what "your result" is.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Common myths</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Myth</th><th>Reality</th></tr>
            </thead>
            <tbody>
              <tr><td>You must see a dream with a colour or symbol</td><td>There is no such requirement in authentic sources.</td></tr>
              <tr><td>You must repeat it exactly seven times</td><td>The "seven times" narration is not established as authentic. Repeating the prayer is allowed, but not required.</td></tr>
              <tr><td>A negative dream means the person is bad</td><td>A dream is not proof about anyone's character. Judge people by their religion, character and conduct.</td></tr>
              <tr><td>Istikhara replaces investigation</td><td>You should still research, ask questions and consult. Istikhara and istishara (consultation) go together.</td></tr>
              <tr><td>Someone else can tell you the result</td><td>The decision and the result belong to the person praying.</td></tr>
            </tbody>
          </table>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What to do after istikhara</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Keep going with the process: meet the family, ask important questions and check references.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Notice what becomes easier or harder: doors that open smoothly or obstacles that appear.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Consult people you trust, such as parents, a mentor or an imam.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Decide, then trust Allah. If you are still unsure, you may pray again and continue to seek advice.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Do not ignore red flags such as dishonesty, pressure or disrespect, even if you feel inclined towards the person.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">When istikhara is used</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Istikhara is for permissible choices where you are unsure, not for deciding whether to obey a clear command or avoid something forbidden. Both the person considering a proposal and, in a family-led process, a parent may pray it. Read our guide on the <a href="/wali-for-nikah-uk" class="text-primary hover:underline">wali for nikah</a> if your family has a say in your decision.</p>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  },
  {
    path: "/nikah-ceremony-uk-step-by-step",
    pageTitle: "Nikah Ceremony in the UK: Step-by-Step Guide and Checklist",
    h1: "Nikah Ceremony in the UK: What Happens, Who Needs to Attend, and What to Prepare",
    heroSubtitle: "A nikah is short and simple — but in the UK it is not automatically a legal marriage. Here is the order of the ceremony, a preparation checklist, and the mistakes that cost couples legal protection.",
    metaDescription: "What happens at a nikah ceremony in the UK? See the steps, who needs to attend, what to prepare, and how to make it legally valid too.",
    keywords: "nikah ceremony uk, nikah ceremony steps, what happens at a nikah, nikah checklist, nikah witnesses, nikah certificate uk",
    canonicalPath: "/nikah-ceremony-uk-step-by-step",
    areaServed: ["United Kingdom"],
    lastReviewed: "14 November 2026",
    lastReviewedISO: "2026-11-14",
    ctaHeading: "Planning Your Nikah?",
    ctaSubtext: "Find a spouse who shares your values on shadiAmour. Create a free profile and connect through a respectful, family-friendly process.",
    relatedLinks: [
      { url: "/is-nikah-legal-in-uk", label: "Is a Nikah Legal in the UK?" },
      { url: "/mahr-in-the-uk", label: "Mahr in the UK" },
      { url: "/wali-for-nikah-uk", label: "Wali for Nikah" },
      { url: "/khula-in-the-uk", label: "Khula in the UK" }
    ],
    pageFaqSchema: [
      { q: "How long does a nikah ceremony take?", a: "Usually between 20 and 45 minutes, depending on the talk and how many people attend." },
      { q: "Who can conduct a nikah?", a: "An imam or a knowledgeable Muslim who understands the requirements. For a legal marriage, someone authorised in law must also be present or you must register separately." },
      { q: "How many witnesses do I need?", a: "At least two adult Muslim witnesses. Schools differ on whether they must be men." },
      { q: "Do I need a nikah certificate?", a: "It is strongly recommended as proof of your Islamic marriage, but it is not the same as the legal marriage certificate." },
      { q: "Can the nikah and the walima be on the same day?", a: "Yes. Many couples do both on one day, though the walima is traditionally held after the marriage begins." },
      { q: "What should the couple wear?", a: "Modest clothing. There is no required outfit." }
    ],
    pageFaqs: [
      { q: "How long does a nikah ceremony take?", a: "Usually between 20 and 45 minutes, depending on the talk and how many people attend." },
      { q: "Who can conduct a nikah?", a: "An imam or a knowledgeable Muslim who understands the requirements. For a legal marriage, someone authorised in law must also be present or you must register separately." },
      { q: "How many witnesses do I need?", a: "At least two adult Muslim witnesses. Schools differ on whether they must be men." },
      { q: "Do I need a nikah certificate?", a: "It is strongly recommended as proof of your Islamic marriage, but it is not the same as the legal marriage certificate." },
      { q: "Can the nikah and the walima be on the same day?", a: "Yes. Many couples do both on one day, though the walima is traditionally held after the marriage begins." },
      { q: "What should the couple wear?", a: "Modest clothing. There is no required outfit." }
    ],
    howTo: {
      name: "Nikah ceremony in the UK, step by step",
      steps: [
        { name: "Arrival and identity checks", text: "Everyone arrives. The imam or officiant confirms the identity of the couple and the wali." },
        { name: "Khutbah", text: "The imam gives a short talk, commonly reminding the couple of taqwa and the rights of marriage. This is recommended, not essential." },
        { name: "Mahr stated", text: "The mahr is stated and agreed in front of everyone." },
        { name: "Ijab", text: "The wali, or the bride's representative, offers the bride in marriage." },
        { name: "Qabul", text: "The groom accepts, clearly and in the presence of the witnesses." },
        { name: "Signing", text: "The contract is signed by the groom, the bride, the wali and the witnesses." },
        { name: "Dua", text: "Dua is made for the couple. Many families also share dates or sweets." },
        { name: "Announcement and walima", text: "The marriage is announced. A walima follows, usually after the couple begin married life." }
      ]
    },
    bodyContent: `
      <div class="prose max-w-none">
        <p class="text-lg text-gray-700 mb-6 leading-relaxed"><strong>Short answer:</strong> a nikah is short and simple. The groom offers and the bride accepts, in front of witnesses, with a mahr agreed and the wali involved. In the UK, make sure it is also a legal marriage, or the nikah alone may not give you legal protection.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">What makes a nikah valid?</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Offer and acceptance (ijab and qabul):</strong> both parties freely agree to the marriage.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>A wali for the bride,</strong> according to most schools. See our <a href="/wali-for-nikah-uk" class="text-primary hover:underline">wali guide</a>.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Witnesses:</strong> adult Muslim witnesses. Schools differ on whether they must be men or may include women, so ask your imam.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700"><strong>Mahr</strong> agreed and stated. See our <a href="/mahr-in-the-uk" class="text-primary hover:underline">mahr guide</a>.</span></li>
        </ul>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Is your nikah also legal in the UK?</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Not automatically. Unless the venue is registered for marriages and an authorised person or registrar is present, or you have a separate civil ceremony, the nikah may not be a legal marriage. Read <a href="/is-nikah-legal-in-uk" class="text-primary hover:underline">Is a nikah legal in the UK?</a> before you book.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Nikah ceremony step by step</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Step</th><th>What happens</th></tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Everyone arrives. The imam or officiant confirms the identity of the couple and the wali.</td></tr>
              <tr><td>2</td><td>The imam gives a short talk (khutbah), commonly reminding the couple of taqwa and the rights of marriage. This is recommended, not essential.</td></tr>
              <tr><td>3</td><td>The mahr is stated and agreed in front of everyone.</td></tr>
              <tr><td>4</td><td>The wali, or the bride's representative, offers the bride in marriage (ijab).</td></tr>
              <tr><td>5</td><td>The groom accepts (qabul), clearly and in the presence of the witnesses.</td></tr>
              <tr><td>6</td><td>The contract is signed by the groom, the bride, the wali and the witnesses.</td></tr>
              <tr><td>7</td><td>Dua is made for the couple. Many families also share dates or sweets.</td></tr>
              <tr><td>8</td><td>The marriage is announced. A walima follows, usually after the couple begin married life.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="text-gray-700 mb-6 leading-relaxed">The ceremony itself can take 20 to 45 minutes. A nikah can happen at a mosque, at home or in a hall. Choose the venue that suits you and, if you need it to be legal too, check that it can do so.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Nikah checklist</h2>
        <div class="seo-table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Notes</th></tr>
            </thead>
            <tbody>
              <tr><td>Imam or officiant booked</td><td>Ask whether the mosque is registered for marriages</td></tr>
              <tr><td>Wali confirmed</td><td>Father or nearest male relative, or an imam for reverts</td></tr>
              <tr><td>Two or more witnesses</td><td>Adult Muslims who can attend in person</td></tr>
              <tr><td>Mahr agreed in writing</td><td>Amount, form, prompt or deferred, and due date</td></tr>
              <tr><td>ID and documents</td><td>Photo ID, and proof of any previous divorce or death of a spouse</td></tr>
              <tr><td>Legal notice given</td><td>At least 28 days before a registered or civil ceremony</td></tr>
              <tr><td>Nikah contract and certificate</td><td>Keep a signed copy, ideally with each spouse</td></tr>
              <tr><td>Civil marriage certificate</td><td>Collect it after the registered ceremony</td></tr>
            </tbody>
          </table>
        </div>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Conditions in the nikah contract</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Couples may add reasonable conditions that do not contradict Islam, for example agreements about work, study, living arrangements or the mahr. Write them clearly and have both parties and witnesses sign. A scholar or solicitor can help you word them.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Online nikah and nikah abroad</h2>
        <p class="text-gray-700 mb-6 leading-relaxed">Scholars have different views on online nikah, and an online nikah is not a UK legal marriage. A marriage held abroad may be recognised if it was valid in that country, but it depends on the circumstances. Get advice before relying on either.</p>

        <h2 class="text-2xl font-bold text-gray-800 mb-4 mt-8 font-['Playfair_Display']">Mistakes to avoid</h2>
        <ul class="list-none space-y-3 mb-6">
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Assuming a mosque nikah certificate is a legal marriage certificate.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Not agreeing the mahr in advance.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Leaving out the wali or witnesses.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Leaving the contract unsigned or without a copy.</span></li>
          <li class="flex items-start gap-3"><span class="text-primary mt-1">•</span><span class="text-gray-700">Planning a large walima before the legal and Islamic paperwork is complete.</span></li>
        </ul>

        <p class="text-sm text-gray-600 mt-8 leading-relaxed"><em>This page gives general guidance and is not legal advice or a fatwa. For your own situation, speak to a qualified solicitor and a trusted scholar or imam.</em></p>
      </div>
    `
  }
];

module.exports = function (app) {
  UK_MARRIAGE_GUIDANCE_PAGES.forEach(function (page) {
    app.get(page.path, (req, res) => {
      res.render("seo-page", page);
    });
  });
};

module.exports.pages = UK_MARRIAGE_GUIDANCE_PAGES;
