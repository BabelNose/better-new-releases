import axios from 'axios';
import { AccessToken } from '../types/AccessToken';

//Spotify Default configs
const defaultAccountUrl = 'https://accounts.spotify.com/api/token';
const defaultBaseApiUrl = 'https://api.spotify.com';
const defaultVersion = 1;

export class SpotifyConnector{
    private baseApiUrl: string;
    private accountUrl: string;
    private version: number;
    private accessToken: AccessToken;
    private isAuthenticated: boolean;

    constructor(baseApiUrl:string = defaultBaseApiUrl, accountUrl:string = defaultAccountUrl, version:number = defaultVersion) {
        this.baseApiUrl = baseApiUrl;
        this.accountUrl = accountUrl;
        this.version = version;
        this.accessToken = {access_token: '', token_type: '', scope: '',refresh_token: '', expires_in: 0};
        this.isAuthenticated = false;
    }

    public getisAuthenticated(){
        return this.isAuthenticated;
    }

    private getAccessHeader() {
        return `${this.accessToken.token_type} ${this.accessToken.access_token}`
    }

    private getAuthHeader() {
        return 'Basic ' + (Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64'))
    }

    private getApiUrl() {
        return `${this.baseApiUrl}/v${this.version}`;
    }

    public async authenticate(code: string | null) {
        const {data} = await axios.post(this.accountUrl, {
                code: code,
                grant_type:'authorization_code',
                redirect_uri: process.env.APP_REDIRECT_URI
            }, {
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': this.getAuthHeader()
                }
            }
        );
        this.accessToken = data;
        this.isAuthenticated = true;
        return this.isAuthenticated;
    }

    private async refreshToken() {
        if(!this.isAuthenticated){
            return false
        }
        const {data} = await axios.post(this.accountUrl, {
            grant_type:'refresh_token',
            refresh_token: this.accessToken.refresh_token
        }, {
            headers: {
            'Authorization': this.getAuthHeader()
            }
        });
        this.accessToken = data;
        return true;
    }

    private async getRequest(url:string) {
        if(!this.isAuthenticated){
            const res = await this.refreshToken();
            if(!res){
                throw Error('There is something wrong with the authentication. Try login in again');
            }
        }
        const completeUrl = `${this.getApiUrl()}${url}`;
        const {data} = await axios.get(completeUrl, {headers:{Authorization:this.getAccessHeader()}});
        return data;
    }

    private async postRequest(url:string, payload:Object){
        if(!this.isAuthenticated){
            const res = await this.refreshToken();
            if(!res){
                throw Error('There is something wrong with the authentication. Try login in again');
            }
        }
        const completeUrl = `${this.getApiUrl()}${url}`;
        const {data} = await axios.post(completeUrl, {...payload}, {headers:{Authorization:this.getAccessHeader()}});
        return data;
    }

    public async getUserSavedAlbums(limit:number = 50, page:number = 0){
        const offset = limit * page;
        const res = await this.getRequest(`/me/albums?offset=${offset}&limit=${limit}`);
        return res;
    }

    public async getUserSavedTracks(limit:number = 50, page:number = 0){
        const offset = limit * page;
        console.log(`Request user tracks offset ${offset}`);
        const res = await this.getRequest(`/me/tracks?offset=${offset}&limit=${limit}`);
        return res;
    }

    public async getNewReleases(country:string = 'CA', limit:number = 50, page:number = 0){
        const offset = limit * page;
        console.log(`Request user tracks offset ${offset}`);
        const res = await this.getRequest(`/search?q=tag:new&type=album&market=${country}&offset=${offset}&limit=${limit}`);
        return res;
    }

    public async getAlbums(country:string = 'CA', albumIds:string[] = []){
        const chunkSize = 20; //Maximum amount of IDs per request
        let albumIdsSplits = []
        //Split ids into chunks of max amount of id
        if(albumIds.length > chunkSize){
            for (let i = 0; i < albumIds.length; i += chunkSize) {
                const chunk = albumIds.slice(i, i + chunkSize);
                albumIdsSplits.push(chunk);
            }    
        }else{
            albumIdsSplits.push(albumIds);
        }

        //Queue up all request as promises
        const promiseArray:Array<Promise<any>> = [];
        albumIdsSplits.forEach((split:string[]) => {
            const idsString = split.join(',');
            promiseArray.push(this.getRequest(`/albums?market=${country}&ids=${idsString}`));
        })

        return Promise.all(promiseArray).then((data) => {
            const returnArray = data.reduce((acc:Array<any>, albumData) => {
                acc.push(...albumData.albums);
                return acc;
            }, [])
            return returnArray;
        })
    }

    public async getUserProfile(){
        console.log(`Request user profile`);
        const res = await this.getRequest('/me')
        return res;
    }

    public async createUserPlaylist(userId:string, name:string, privPub:boolean, description:string){
        const res = await this.postRequest(`/users/${userId}/playlists`, {
            name:name,
            public:privPub,
            description:description
        });
        return res;
    }

    public async addToUserPlaylist(playlistId:string, trackUris:string[]){
        const res = await this.postRequest(`/playlists/${playlistId}/tracks`, {
            uris:trackUris
        });
        return res;
    }
}