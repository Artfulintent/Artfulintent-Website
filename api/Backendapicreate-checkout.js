const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    try {
        const { artworkId, buyerEmail } = req.body;

        // 1. Get Artwork & Artist Details from Database
        const { data: artwork, error } = await supabase
            .from('artworks')
            .select(`
                *,
                artist:users!artist_id (stripe_account_id, membership_tier)
            `)
            .eq('id', artworkId)
            .single();

        if (error || !artwork) throw new Error('Artwork not found');

        // 2. Calculate Fees based on Business Plan
        const price = artwork.price * 100; // Convert to cents
        let commissionRate = 0.25; // Default Starter Tier (25%)

        if (artwork.artist.membership_tier === 'professional') commissionRate = 0.20;
        if (artwork.artist.membership_tier === 'featured') commissionRate = 0.15;

        const platformFee = Math.round(price * commissionRate);
        
        // 3. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: artwork.title,
                        description: `Original work by Artist #${artwork.artist_id}`,
                        images: artwork.images ? [artwork.images[0]] : [],
                    },
                    unit_amount: price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            payment_intent_data: {
                // THE AUTONOMOUS SPLIT
                application_fee_amount: platformFee, // You keep this
                transfer_data: {
                    destination: artwork.artist.stripe_account_id, // Artist gets the rest
                },
            },
            success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/store.html`,
            customer_email: buyerEmail,
            metadata: {
                artworkId: artworkId,
                type: 'store_purchase'
            }
        });

        res.status(200).json({ id: session.id, url: session.url });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};