import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { RafflePageComponent } from './raffle-page.component';
import { RaffleService } from './raffle.service';

describe('RafflePageComponent', () => {
  let component: RafflePageComponent;
  let fixture: ComponentFixture<RafflePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RafflePageComponent],
      providers: [
        {
          provide: RaffleService,
          useValue: {
            setRaffleSpinning: () => undefined,
            consumeSpin: async () => ({ allowed: true, spinsRemaining: 1 }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
          },
        },
        {
          provide: Router,
          useValue: {
            navigateByUrl: async () => true,
            url: '/',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RafflePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates confetti pieces for the winner celebration', () => {
    expect(component.confettiPieces.length).toBe(28);
  });
});
