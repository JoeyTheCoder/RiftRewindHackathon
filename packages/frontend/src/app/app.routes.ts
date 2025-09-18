import { Routes } from '@angular/router';
import { HomeComponent } from '../home/home.component';
import { SummonerProfileComponent } from './summoner-profile/summoner-profile.component';

export const routes: Routes = [
    {
        path: '',
        component: HomeComponent
    },
    {
        path: 'summoner/:region/:name',
        component: SummonerProfileComponent
    }
];
