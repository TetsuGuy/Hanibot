import axios from 'axios';
class LiveSubscriberCounter {
    constructor(apiKey, channelId, logger) {
        this.pollingInterval = null;
        this.subscriberCount = 0;
        this.apiKey = apiKey;
        this.channelId = channelId;
        this.baseUrl = 'https://www.googleapis.com/youtube/v3/channels';
        this.logger = logger;
    }
    async fetchSubscriberCount() {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    part: 'statistics',
                    id: this.channelId,
                    key: this.apiKey
                }
            });
            const subscriberCount = parseInt(response.data.items[0].statistics.subscriberCount, 10);
            this.logger.log(`Subscriber Count: ${subscriberCount}`);
            return subscriberCount;
        }
        catch (error) {
            this.logger.error(`Error fetching subscriber count: ${error.message}`);
            throw error;
        }
    }
    startPolling(intervalMs) {
        this.fetchSubscriberCount(); // Fetch immediately
        this.pollingInterval = setInterval(async () => {
            this.subscriberCount = await this.fetchSubscriberCount();
        }, intervalMs);
    }
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}
export default LiveSubscriberCounter;
