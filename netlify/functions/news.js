exports.handler = async function () {
  const apiKey = process.env.GUARDIAN_API_KEY || 'test';

  const EXCLUDE = /Starmer|Streeting|Labour|Tory|Chancellor|NHS|council tax|National Insurance|Sunak|king.s speech|shoppers|supermarket|chocolate|GameStop|housebuilder|estate agent|WH Smith|Milka|Coles|Gaza|Ukraine|drone|Hamas|Netanyahu|ceasefire|Zelensky|Putin|Congress vote|Senate vote|clinical trial|cancer|weight loss/i;

  const PREFER = /Turkey|Turkish|Istanbul|Gulf|UAE|Saudi|Qatar|GCC|Middle East|Egypt|EU trade|Eurozone|Bosphorus|Suez|oil price|gas price|tariff|supply chain|exports|imports|logistics|commodit|OPEC|lira|CBRT|inflation|manufactur/i;

  try {
    const url =
      `https://content.guardianapis.com/search` +
      `?section=business&show-fields=trailText&page-size=20&order-by=newest&api-key=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();
    const results = json?.response?.results || [];

    const kept = results.filter(a => !EXCLUDE.test(a.webTitle));

    const scored = [...kept].sort((a, b) => {
      const textA = a.webTitle + ' ' + (a.fields?.trailText || '');
      const textB = b.webTitle + ' ' + (b.fields?.trailText || '');
      return (PREFER.test(textB) ? 1 : 0) - (PREFER.test(textA) ? 1 : 0);
    });

    const picked = scored.slice(0, 8);

    if (picked.length === 0) {
      return { statusCode: 502, body: JSON.stringify({ error: 'No usable articles' }) };
    }

    function tag(text) {
      const t = (text || '').toLowerCase();
      if (/lira|cbrt|central bank|rate|inflation|currency|fx/.test(t)) return 'FX';
      if (/steel|cement|polymer|grain|wheat|food|commodit|aluminium|copper/.test(t)) return 'Commodities';
      if (/merger|acquisit|m&a|buyout|takeover/.test(t)) return 'M&A';
      if (/tariff|sanction|policy|agreement|treaty|customs|free trade/.test(t)) return 'Policy';
      if (/port|logistic|ship|freight|transport|cargo|suez|bosphorus/.test(t)) return 'Logistics';
      if (/oil|gas|energy|pipeline|opec|barrel/.test(t)) return 'Energy';
      if (/wheat|grain|corn|agri|farm/.test(t)) return 'Agri';
      if (/export|import|trade|supply chain|manufactur/.test(t)) return 'Exports';
      return 'Markets';
    }

    function istanbulTime(iso) {
      const d = new Date(new Date(iso).getTime() + 3 * 3600000);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }

    function clip(text, words) {
      const w = (text || '').split(' ');
      return w.length <= words ? text : w.slice(0, words).join(' ') + '…';
    }

    const [lead, ...rest] = picked;
    const leadSummary = (lead.fields?.trailText || '').replace(/<[^>]+>/g, '');

    const result = {
      generated_at: new Date().toISOString(),
      breaking: clip(lead.webTitle, 22),
      lead: {
        headline: clip(lead.webTitle, 22),
        summary: leadSummary,
        tags: [tag(lead.webTitle + ' ' + leadSummary)]
      },
      wire: rest.slice(0, 7).map(a => ({
        time: istanbulTime(a.webPublicationDate),
        headline: clip(a.webTitle, 16),
        tag: tag(a.webTitle)
      }))
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
