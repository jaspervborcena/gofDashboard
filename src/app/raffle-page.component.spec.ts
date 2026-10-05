import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RafflePageComponent } from './raffle-page.component';
import { RaffleService } from './raffle.service';

describe('RafflePageComponent', () => {
  let component: RafflePageComponent;
  let fixture: ComponentFixture<RafflePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RafflePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: RaffleService,
          useValue: {
            setRaffleSpinning: () => undefined,
            isRaffleActive: () => true,
            consumeSpin: async () => ({ allowed: true, spinsRemaining: 1 }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: { paramMap: convertToParamMap({}) },
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
