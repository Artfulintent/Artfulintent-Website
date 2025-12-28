const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { auctionId, bidAmount, userId } = req.body;

    try {
        // 1. Get current auction state
        const { data: auction } = await supabase
            .from('auctions')
            .select('*')
            .eq('id', auctionId)
            .single();

        // 2. Validate Rules
        if (new Date() > new Date(auction.end_time)) {
            return res.status(400).json({ error: 'Auction has ended' });
        }

        if (bidAmount <= auction.current_bid) {
            return res.status(400).json({ error: 'Bid must be higher than current price' });
        }

        // 3. Place Bid (Transactional)
        const { error: bidError } = await supabase
            .from('bids')
            .insert([{ auction_id: auctionId, bidder_id: userId, amount: bidAmount }]);

        if (bidError) throw bidError;

        // 4. Update Auction Current Price
        await supabase
            .from('auctions')
            .update({ current_bid: bidAmount, winning_bidder_id: userId })
            .eq('id', auctionId);

        res.status(200).json({ success: true, message: 'Bid accepted', newPrice: bidAmount });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};