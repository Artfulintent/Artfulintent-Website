const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
import { buffer } from 'micro';

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export const config = {
    api: {
        bodyParser: false, // Stripe requires raw body
    },
};

module.exports = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const buf = await buffer(req);
    let event;

    try {
        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const artworkId = session.metadata.artworkId;

        // AUTOMATION: Mark artwork as sold in DB
        if (artworkId) {
            await supabase
                .from('artworks')
                .update({ status: 'sold' })
                .eq('id', artworkId);
            
            // Log the order
            await supabase.from('orders').insert([{
                artwork_id: artworkId,
                total_amount: session.amount_total / 100,
                stripe_session_id: session.id,
                payment_status: 'paid'
            }]);
        }
    }

    res.status(200).json({ received: true });
};