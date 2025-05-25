import axios from 'axios';

interface Logger {
    log: (message: string) => void;
    error: (message: string) => void;
}

class LiveSubscriberCounter {
    private apiKey: string;
    private channelId: string;
    private baseUrl: string;
    private pollingInterval: NodeJS.Timeout | null = null;
    private logger: Logger;
    public subscriberCount = 0;

    constructor(apiKey: string, channelId: string, logger: Logger) {
        this.apiKey = apiKey;
        this.channelId = channelId;
        this.baseUrl = 'https://www.googleapis.com/youtube/v3/channels';
        this.logger = logger;
    }

    async fetchSubscriberCount(): Promise<number> {
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
        } catch (error: any) {
            this.logger.error(`Error fetching subscriber count: ${error.message}`);
            throw error;
        }
    }

    startPolling(intervalMs: number): void {
        this.fetchSubscriberCount(); // Fetch immediately
        this.pollingInterval = setInterval(async () => {
            this.subscriberCount = await this.fetchSubscriberCount();
        }, intervalMs);
    }

    stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

export default LiveSubscriberCounter;