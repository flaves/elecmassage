import type { Context } from '@netlify/functions';

type Order = {
  id: number;
  total_price: number;
  landing_site: string | null;
  created_at: string;
};

export default async function onOrderCreate(req: Request, _context: Context) {
  try {
    const voluumAccessKeyId = Netlify.env.get('VOLUUM_ACCESS_KEY_ID');
    if (!voluumAccessKeyId) {
      throw new Error('VOLUUM_ACCESS_KEY_ID not found');
    }
    const voluumAccessKey = Netlify.env.get('VOLUUM_ACCESS_KEY');
    if (!voluumAccessKey) {
      throw new Error('VOLUUM_ACCESS_KEY not found');
    }
    const body = await req.text();
    const order = JSON.parse(body) as Order;
    const payout = order.total_price;
    if (!order.landing_site) {
      throw new Error('Key landing_site not found');
    }
    const { cpid, cid } = extractParams(order.landing_site);
    const transactionId = order.id.toString();
    const conversionType = 'sale';
    const conversionTime = order.created_at;

    let csv: string;
    if (cid) {
      csv = `${cid},${payout},${transactionId},${conversionType},${conversionTime}\n`;
    } else if (cpid) {
      csv = `,${payout},${transactionId},${conversionType},${conversionTime},${cpid}\n`;
    } else {
      throw new Error('Params CPID and CID not found');
    }

    await fetch(`https://api.voluum.com/conversion`, {
      method: 'POST',
      body: csv,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        accessId: voluumAccessKeyId,
        accessKey: voluumAccessKey,
      },
    });

    return new Response('Success', { status: 200 });
  } catch (err) {
    if (err instanceof Error) {
      return new Response(err.message, { status: 500 });
    }
    return new Response('Unknown Error', { status: 500 });
  }
}

function extractParams(url: string) {
  const fullUrl = new URL(url, 'https://dummy-base.com');
  const searchParams = fullUrl.searchParams;
  const cpid = searchParams.get('cpid');
  const cid = searchParams.get('cid');
  return { cpid, cid };
}

/**
 * https://panel.voluum.com/?clientId=901b60eb-61e3-4f66-919f-f257bb56dd72#/advanced/postback-upload
 * Conversions with ClickID:
 * 1. ClickID, 2. Payout, 3. Transaction ID, 4. Conversion Type, 5. Conversion Time, 6. leave empty, 7. leave empty, 8. Param 1, 9. Param 2, 10. Param 3, 11. Param 4, 12. Param 5
 * It is not allowed to specify payout currency with clickid.
 * For conversions without ClickID:
 * 1. leave empty, 2. Payout, 3. Transaction ID, 4. Conversion Type, 5. Conversion Time, 6. Campaign ID, 7. Payout currency, 8. Param 1, 9. Param 2, 10. Param 3, 11. Param 4, 12. Param 5, 13. Offer ID, 14. Lander ID, 15. Flow ID, 16. Path ID, 17. Custom Var 1, 18. Custom Var 2, 19. Custom Var 3, 20. Custom Var 4, 21. Custom Var 5, 22. Custom Var 6, 23. Custom Var 7, 24. Custom Var 8, 25. Custom Var 9, 26. Custom Var 10, 27. External ID, 28. External ID type
 * Required 1. Click ID or 6. Campaign ID
 * example click id only: c384EFV6JHQODRN70575OK6U
 * example campaign id: ,,,,,22899e12-b07e-4e9f-a5ef-cb10c56ca363
 */
