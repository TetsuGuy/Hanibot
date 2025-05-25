import { Logger } from "./types";

class TwitterService {
    bearerToken: string;
    logger: any;
    disableApi: boolean;
    baseUrl: string;

    constructor({ bearerToken, logger, disableApi = false }: { bearerToken: string; logger: Logger; disableApi?: boolean }) {
        this.bearerToken = bearerToken;
        this.logger = logger;
        this.disableApi = disableApi;
        this.baseUrl = 'https://api.twitter.com/2';
    }

    async fetchTweets(params: Record<string, string | undefined>): Promise<any[]> {
        if (this.disableApi) {
            this.logger.warn("API calls are disabled.");
            return [];
        }

        const url = new URL(`${this.baseUrl}/tweets/search/recent`);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.append(key, value);
        });

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${this.bearerToken}` }
        });

        const data = await res.json();

        if (data.status === 429) {
            this.logger.error("Rate limit exceeded. Waiting for 15 minutes.");
        } else {
            this.logger.log(`Fetched ${data.meta?.result_count || 0} tweets.`);
        }

        return data?.data || [];
    }

    async searchTweets(query: string, sinceId?: string): Promise<any[]> {
        if (this.disableApi) {
            this.logger.warn("API calls are disabled.");
            return [];
        }

        const params = {
            query: `${query} -is:retweet -is:quote`,
            'tweet.fields': 'created_at,author_id,text',
            max_results: '100',
            since_id: sinceId
        };
        return this.fetchTweets(params);
    }

    async searchUserTweets(userId: string, sinceId?: string): Promise<any[]> {
        if (this.disableApi) {
            this.logger.warn("API calls are disabled.");
            return [];
        }

        const params = {
            query: `from:${userId}`,
            'tweet.fields': 'created_at,author_id,text',
            max_results: '100',
            since_id: sinceId
        };
        return this.fetchTweets(params);
    }

    async getUserId(username: string): Promise<string | null> {
        if (this.disableApi) {
            this.logger.warn("API calls are disabled.");
            return null;
        }

        const url = new URL(`${this.baseUrl}/users/by/username/${username}`);
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${this.bearerToken}` }
        });
        const data = await res.json();

        if (!res.ok) {
            this.logger.error(`Failed to fetch user ID for username: ${username}. Error: ${data.error || res.statusText}`);
            throw new Error(data.error || res.statusText);
        }

        this.logger.log(`Fetched user ID for username: ${username}`);
        return data?.data?.id;
    }
}

export default TwitterService;