import type { Context } from '@netlify/functions';

type NoteAttribute = {
  name: string;
  value: string;
};

type Order = {
  id: number;
  total_price: string;
  landing_site: string | null;
  note_attributes: NoteAttribute[];
  created_at: string;
};

export default async function onOrderCreate(req: Request, _context: Context) {
  console.log('========== WEBHOOK RECEIVED ==========');
  console.log('Timestamp:', new Date().toISOString());

  try {
    const voluumAccessKeyId = Netlify.env.get('VOLUUM_ACCESS_KEY_ID');
    console.log('VOLUUM_ACCESS_KEY_ID exists:', !!voluumAccessKeyId);
    if (!voluumAccessKeyId) {
      throw new Error('VOLUUM_ACCESS_KEY_ID not found');
    }

    const voluumAccessKey = Netlify.env.get('VOLUUM_ACCESS_KEY');
    console.log('VOLUUM_ACCESS_KEY exists:', !!voluumAccessKey);
    if (!voluumAccessKey) {
      throw new Error('VOLUUM_ACCESS_KEY not found');
    }

    const body = await req.text();
    console.log('Raw body length:', body.length);
    console.log('Raw body:', body);

    const order = JSON.parse(body) as Order;
    console.log('========== ORDER DATA ==========');
    console.log('Order ID:', order.id);
    console.log('Order total_price:', order.total_price);
    console.log('Order total_price type:', typeof order.total_price);
    console.log('Order created_at:', order.created_at);
    console.log('Order landing_site:', order.landing_site);
    console.log(
      'Order note_attributes:',
      JSON.stringify(order.note_attributes),
    );
    console.log('Order note_attributes type:', typeof order.note_attributes);
    console.log(
      'Order note_attributes is array:',
      Array.isArray(order.note_attributes),
    );
    console.log('Order note_attributes length:', order.note_attributes?.length);

    const { cpid, cid } = extractFromNoteAttributes(order.note_attributes);
    console.log('========== EXTRACTED FROM NOTE_ATTRIBUTES ==========');
    console.log('Extracted CID:', cid);
    console.log('Extracted CPID:', cpid);

    if (!cid && !cpid) {
      console.log('========== FALLBACK TO LANDING_SITE ==========');
      console.log('No params in note_attributes, trying landing_site');
      console.log('Landing site value:', order.landing_site);

      if (order.landing_site) {
        const fallback = extractFromLandingSite(order.landing_site);
        console.log('Fallback CID:', fallback.cid);
        console.log('Fallback CPID:', fallback.cpid);

        if (fallback.cid || fallback.cpid) {
          return await sendConversion(
            order,
            fallback.cid,
            fallback.cpid,
            voluumAccessKeyId,
            voluumAccessKey,
          );
        }
      }
      throw new Error(
        'Params CPID and CID not found in note_attributes or landing_site',
      );
    }

    return await sendConversion(
      order,
      cid,
      cpid,
      voluumAccessKeyId,
      voluumAccessKey,
    );
  } catch (err) {
    console.log('========== ERROR ==========');
    console.log('Error type:', typeof err);
    console.log('Error:', err);
    if (err instanceof Error) {
      console.log('Error message:', err.message);
      console.log('Error stack:', err.stack);
      return new Response(err.message, { status: 500 });
    }
    return new Response('Unknown Error', { status: 500 });
  }
}

function extractFromNoteAttributes(
  noteAttributes: NoteAttribute[] | undefined,
): { cpid: string | null; cid: string | null } {
  console.log('========== extractFromNoteAttributes ==========');
  console.log('Input noteAttributes:', JSON.stringify(noteAttributes));
  console.log('Input type:', typeof noteAttributes);
  console.log('Is undefined:', noteAttributes === undefined);
  console.log('Is null:', noteAttributes === null);
  console.log('Is array:', Array.isArray(noteAttributes));

  if (!noteAttributes || !Array.isArray(noteAttributes)) {
    console.log('noteAttributes is invalid, returning nulls');
    return { cpid: null, cid: null };
  }

  console.log('Iterating through noteAttributes:');
  noteAttributes.forEach((attr, index) => {
    console.log(`  [${index}] name: "${attr.name}", value: "${attr.value}"`);
  });

  const cpidAttr = noteAttributes.find((attr) => attr.name === 'cpid');
  const cidAttr = noteAttributes.find((attr) => attr.name === 'cid');

  console.log('Found cpid attr:', JSON.stringify(cpidAttr));
  console.log('Found cid attr:', JSON.stringify(cidAttr));

  const cpid = cpidAttr?.value || null;
  const cid = cidAttr?.value || null;

  console.log('Final cpid:', cpid);
  console.log('Final cid:', cid);

  return { cpid, cid };
}

function extractFromLandingSite(url: string): {
  cpid: string | null;
  cid: string | null;
} {
  console.log('========== extractFromLandingSite ==========');
  console.log('Input URL:', url);

  try {
    const fullUrl = new URL(url, 'https://dummy-base.com');
    console.log('Parsed URL href:', fullUrl.href);
    console.log('Parsed URL search:', fullUrl.search);
    console.log(
      'SearchParams entries:',
      Array.from(fullUrl.searchParams.entries()),
    );

    const cpid = fullUrl.searchParams.get('cpid');
    const cid = fullUrl.searchParams.get('cid');

    console.log('Extracted cpid:', cpid);
    console.log('Extracted cid:', cid);

    return { cpid, cid };
  } catch (err) {
    console.log('Error parsing URL:', err);
    return { cpid: null, cid: null };
  }
}

async function sendConversion(
  order: Order,
  cid: string | null,
  cpid: string | null,
  accessKeyId: string,
  accessKey: string,
): Promise<Response> {
  console.log('========== sendConversion ==========');
  console.log('Order ID:', order.id);
  console.log('CID:', cid);
  console.log('CPID:', cpid);

  const transactionId = order.id.toString();
  const conversionType = 'purchase_shopify';
  const conversionTime = order.created_at;
  const payout = order.total_price;

  console.log('Transaction ID:', transactionId);
  console.log('Conversion Type:', conversionType);
  console.log('Conversion Time:', conversionTime);
  console.log('Payout:', payout);

  let csv: string;
  if (cid) {
    csv = `${cid},${payout},${transactionId},${conversionType},${conversionTime}\n`;
    console.log('Using CID format');
  } else if (cpid) {
    csv = `,${payout},${transactionId},${conversionType},${conversionTime},${cpid}\n`;
    console.log('Using CPID format');
  } else {
    throw new Error('Params CPID and CID not found');
  }

  console.log('CSV payload:', csv);
  console.log('CSV payload length:', csv.length);

  console.log('========== VOLUUM AUTH ==========');
  console.log('Auth URL: https://api.voluum.com/auth/access/session');
  console.log('Access Key ID (first 8 chars):', accessKeyId.substring(0, 8));

  const tokenRes = await fetch('https://api.voluum.com/auth/access/session', {
    method: 'POST',
    body: JSON.stringify({
      accessId: accessKeyId,
      accessKey: accessKey,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  console.log('Token response status:', tokenRes.status);
  console.log('Token response statusText:', tokenRes.statusText);
  console.log(
    'Token response headers:',
    JSON.stringify(Object.fromEntries(tokenRes.headers.entries())),
  );

  const tokenResText = await tokenRes.text();
  console.log('Token response body:', tokenResText);

  if (!tokenRes.ok) {
    throw new Error(
      `Token Response not ok: ${tokenRes.status} - ${tokenResText}`,
    );
  }

  const tokenBody = JSON.parse(tokenResText) as { token: string };
  console.log(
    'Token received (first 20 chars):',
    tokenBody.token.substring(0, 20),
  );

  console.log('========== VOLUUM CONVERSION ==========');
  console.log('Conversion URL: https://api.voluum.com/conversion');

  const conversionRes = await fetch('https://api.voluum.com/conversion', {
    method: 'POST',
    body: csv,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'cwauth-token': tokenBody.token,
    },
  });

  console.log('Conversion response status:', conversionRes.status);
  console.log('Conversion response statusText:', conversionRes.statusText);
  console.log(
    'Conversion response headers:',
    JSON.stringify(Object.fromEntries(conversionRes.headers.entries())),
  );

  const conversionResText = await conversionRes.text();
  console.log('Conversion response body:', conversionResText);

  if (!conversionRes.ok) {
    throw new Error(
      `Conversion Response not ok: ${conversionRes.status} - ${conversionResText}`,
    );
  }

  const conversionBody = JSON.parse(conversionResText) as {
    numberOfRows: number;
  };
  console.log('Number of rows added:', conversionBody.numberOfRows);

  const message = `Order #${order.id} - Success: ${conversionBody.numberOfRows} conversion(s) added`;
  console.log('========== SUCCESS ==========');
  console.log(message);

  return new Response(message, { status: 200 });
}
