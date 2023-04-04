import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Request, Response } from 'express';
import { generateRandomString } from './utils/GenerateRandomString';
import { SpotifyConnector } from './connector/SpotifyConnector';
const querystring = require('querystring');

dotenv.config();

const express = require('express')
const app = express()
const Spotify = new SpotifyConnector();

app.use(cors()).use(cookieParser())

app.get('/', function (req:Request, res:Response) {
    if(Spotify.getisAuthenticated()){
        res.send('Hello Spotify Person you are authenticated');
    }else{
        res.send('Hello Spotify People');
    }
})

app.get('/login', function(req:Request, res:Response) {
    const state = generateRandomString(16);
    const allowedScopes = ['playlist-modify-private', 'user-read-private', 'user-read-email', 'user-library-read']
  
    res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        scope: allowedScopes.join(' '),
        redirect_uri: process.env.APP_REDIRECT_URI,
        state: state
    }));
});

app.get('/callback', async function(req:Request, res:Response) {

    var code = req.query.code?.toString() || null;
    var state = req.query.state || null;
  
    if (state === null) {
      res.redirect('/#' +
      querystring.stringify({
          error: 'state_mismatch'
        }));
    } else {
       const spotRes = await Spotify.authenticate(code);
       console.log('Authentication res: ', spotRes);
       res.redirect('/');
    }
  });

app.get('/start', async function (req:Request, res:Response) {
    let curPage = 0;
    let nextPage = 'first page'
    let userMarket = '';
    const userArtistList:any[] = [];
    const newReleaseList:any[] = [];
    const newReleaseMatch:any[] = [];

    const userProfile = await Spotify.getUserProfile();
    console.log("country set", userProfile.country);
    userMarket = userProfile.country
    
    while(nextPage){
        const data = await Spotify.getUserSavedTracks(50, curPage);
        console.log("TOTAL", data.total);
        const newArtists = data.items.reduce((acc:any, item:any) => {
            //Changing format of artist
            const tempArtists = item.track.artists.map((artist:any) => (artist.id));
            //Checking for dupes within the request list
            let toInclude = tempArtists.filter((artist:any) => !acc.includes(artist));
            //Checking for dupes withing the master list
            toInclude = toInclude.filter((artist:any) => !userArtistList.includes(artist))
            //Add new artist to the list
            acc.push(...toInclude);
            return acc;
        }, []);
        userArtistList.push(...newArtists);
        nextPage = data.next;
        curPage++;
    }
    
    curPage = 0;
    nextPage = 'first page'
    while(nextPage){
        const data = await Spotify.getNewReleases(userMarket,50, curPage);
        console.log("TOTAL: ", data.albums.total);
        data.albums.items.forEach((album:any, index:number) => {
            if(album){
                let isMatch = false;
                album.artists.forEach((artist:any) => {
                    if(userArtistList.find((userArtist => userArtist === artist.id))){
                        isMatch = true
                    }
                });
                if(isMatch){
                    if(!newReleaseMatch.find((match => match.id === album.id))){
                        newReleaseMatch.push(album);
                    }
                }
            }else{
                console.log("Bad data at index: ", index)
            }
        });
        newReleaseList.push(...data.albums.items);
        nextPage = data.albums.next;
        curPage++;
    }

    console.log("How many artists do I like?",userArtistList.length)
    console.log("How many new releases?", newReleaseList.length);
    console.log("How many new releases match?", newReleaseMatch.length);

    const newReleaseMatchIds:string[] = newReleaseMatch.map(newMatch => newMatch.id);
    const matchAlbumData = await Spotify.getAlbums(userMarket,newReleaseMatchIds);
    const matchTrackUris = matchAlbumData.map(matchAlbum => {
        console.log(matchAlbum.tracks.items[0]);
        return matchAlbum.tracks.items[0].uri;
    });

    const newPlaylist = await Spotify.createUserPlaylist(userProfile.id, 'cool api', false, 'A really cool api playlist');
    await Spotify.addToUserPlaylist(newPlaylist.id, matchTrackUris);

    const returnHTML = newReleaseMatch.map(newMatch => `<img src="${newMatch.images[0].url}" height="150" width="150"/>`)
    res.set('Content-Type', 'text/html');
    res.send(returnHTML.join(''));
});

app.listen(3000)